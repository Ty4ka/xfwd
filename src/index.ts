import httpProxy from 'http-proxy'
import greenlock from 'greenlock-express'
import { TXfwdServerSettings } from './types/types'

class XfwdServer {
  private _settings: TXfwdServerSettings

  constructor(s: TXfwdServerSettings) {
    this._settings = {
      sslConfigDir: './greenlock.d',
      ...s
    }
  }

  start() {
    const { email, appPath, sslConfigDir } = this._settings

    greenlock
      .init({
        packageRoot: appPath,

        // contact for security and critical bug notices
        maintainerEmail: email,

        // where to look for configuration
        configDir: sslConfigDir,

        // whether or not to run at cloudscale
        cluster: false
      })
      // Serves on 80 and 443
      // Get's SSL certificates magically!
      .serve(this.httpsWorker)
  }

  protected httpsWorker(glx: any) {
    const { xfwdDomains } = this._settings

    // we need the raw https server
    const server = glx.httpsServer()
    const proxy = httpProxy.createProxyServer({
      xfwd: true
    })

    // catches error events during proxying
    proxy.on('error', function (err, req, res) {
      console.error(err)
      res.statusCode = 500
      res.end()
      return
    })

    // We'll proxy websockets too
    server.on('upgrade', async function (req: any, socket: any, head: any) {
      const hostname = req.hostname.toLowerCase()
      const xfwdDomain = xfwdDomains[hostname]

      if (xfwdDomain) {
        proxy.ws(req, socket, head, {
          ws: true,
          target: `ws://localhost:${xfwdDomain.port}`
        })
      }
    })

    // servers a node app that proxies requests to a localhost
    glx.serveApp(async function (req: any, res: any) {
      const hostname = req.hostname.toLowerCase()
      const xfwdDomain = xfwdDomains[hostname]

      if (xfwdDomain) {
        proxy.web(req, res, {
          target: `http://localhost:${xfwdDomain.port}`
        })
      }
    })
  }
}

export { XfwdServer }
