import path from 'path'
import * as pty from 'node-pty'
import {execSync} from 'child_process'
import stripAnsi from 'strip-ansi'
import {ENV_NAME} from '../environment'

// from http://stackoverflow.com/questions/17470554/how-to-capture-the-arrow-keys-in-node-js
const keyCodes = {
  'up': '\u001b[A',
  'down': '\u001b[B',
  'right': '\u001b[C',
  'left': '\u001b[D',
  'enter': '\n',
  'space': ' ',
}

const SYNTHETIC_DELAY_MS = 150

export const NAVY_BIN = path.join(__dirname, '../../../packages/navy/bin/navy.js')

export default class Automator {

  static spawn(args, opts = {}) {
    const automator = new this(args, opts)
    automator.spawn()
    return automator
  }

  constructor(args, opts) {
    this.args = args
    this.opts = opts
  }

  spawn() {
    console.log()
    console.log(' >', NAVY_BIN, this.args.join(' '))
    console.log()

    this.output = ''

    const cwd = this.opts.cwd || path.join(__dirname, '../dummy-navies/basic')
    execSync('mkdir -p ' + cwd)

    this.term = pty.spawn(NAVY_BIN, this.args, {
      name: 'xterm-color',
      cols: 130,
      rows: 30,
      cwd,
      env: {
        NAVY_NAME: ENV_NAME,
        ...(this.opts.env || process.env),
      },
    })

    this.term.pipe(process.stdout)

    this.term.on('data', data => this.output += data.toString())

    this.term.on('exit', () => {
      console.log()
      console.log(' - Exited')
      console.log()

      this.exited = true
    })
  }

  send(keyCode) {
    // synthetic delay
    return new Promise(resolve =>
      setTimeout(() => {
        this.term.write(keyCodes[keyCode] || keyCode)
        resolve()
      }, SYNTHETIC_DELAY_MS)
    )
  }

  waitForDone() {
    if (this.exited) {
      return stripAnsi(this.output)
    }

    return new Promise(resolve =>
      this.term.on('exit', () => resolve(stripAnsi(this.output)))
    )
  }

  waitForLaunch() {
    let resolved = false
    return new Promise((resolve, reject) => {
      this.term.on('data', () => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      })
    })
  }

  getOutput() {
    return stripAnsi(this.output)
  }

  getRawOutput() {
    return this.output
  }

}
