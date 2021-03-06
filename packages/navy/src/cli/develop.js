/* @flow */

import path from 'path'
import chalk from 'chalk'
import invariant from 'invariant'

import {getNavy} from '../'
import {NavyError} from '../errors'
import docker from '../util/docker-client'
import getNavyRc from '../util/navyrc'

export default async function (service: string, opts: Object): Promise<void> {
  const navy = getNavy(opts.navy)
  const cwd = process.cwd()
  const navyRc = await getNavyRc(cwd)

  if (!navyRc || !navyRc.services) {
    throw new NavyError(`No valid .navyrc file was found in "${cwd}"`)
  }

  if (!navyRc.develop) {
    throw new NavyError('No develop mounts found in .navyrc')
  }

  if (navyRc.services.length > 1 && !service) {
    throw new NavyError('Multiple service mappings are defined in .navyrc, you need to explicitly specify what service to develop')
  }

  if (!service) service = navyRc.services[0]

  if (navyRc.services.indexOf(service) === -1) {
    throw new NavyError(`Service "${service}" is not a valid development target`)
  }

  const mounts = {}
  Object.keys(navyRc.develop.mounts).forEach(localPath =>
    mounts[path.resolve(localPath)] = navyRc.develop.mounts[localPath]
  )

  const state = (await navy.getState()) || {}

  await navy.saveState({
    ...state,
    services: {
      ...state.services,
      [service]: {
        ...(state.services || {})[service],
        _develop: {
          mounts,
          command: navyRc.develop.command,
        },
      },
    },
  })

  await navy.emitAsync('cli.develop.beforeLaunch')

  await navy.kill([service])
  await navy.launch([service], { noDeps: true })

  console.log(`🚧  ${service} has now restarted in development 🚧`)
  console.log(chalk.dim('-----------'))
  console.log()

  const container = (await navy.ps()).filter(_service => _service.name === service)[0]

  invariant(container, 'DEVELOP_NO_CONTAINER_ID')

  const containerId = container.id

  const containerObj = docker.getContainer(containerId)
  containerObj.attach({stream: true, stdout: true, stderr: true})
    .then(stream =>
      containerObj.modem.demuxStream(stream, process.stdout, process.stderr)
    )
    .catch(() => {
      console.log()
      console.log(chalk.dim(`-------> ${service} exited`))
      console.log()
    })
}
