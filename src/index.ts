import path from 'path'
import httpProxy from 'http-proxy'
import greenlock from 'greenlock-express'
import { ensureDirectoryExistence, saveText } from 'fs-extreme'
import { TXfwdServerSettings } from './types/types'
import { requiresTrySimport } from 'esm-requirer'

class XfwdServer {
  private _settings: TXfwdServerSettings

  constructor(s: TXfwdServerSettings) {
    this._settings = {
      sslConfigPath: path.join(s.appPath, 'greenlock.d'),
      ...s
    }
  }

  async start() {
    const { email, appPath, sslConfigPath: sslConfigDir } = this._settings
    const newSsl = await this.greenlock()

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

    return newSsl
  }

  protected httpsWorker(glx: any) {
    const { xfwdDomains } = this._settings

    // we need the raw https server
    const server = glx.httpsServer()
    const proxy = httpProxy.createProxyServer({
      xfwd: true
    })

    // catches error events during proxying
    proxy.on('error', (err, req, res) => {
      // console.error(err)
      res.statusCode = 500
      res.end()
      return
    })

    // We'll proxy websockets too
    server.on('upgrade', async (req: any, socket: any, head: any) => {
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
    glx.serveApp(async (req: any, res: any) => {
      const hostname = req.hostname.toLowerCase()
      const xfwdDomain = xfwdDomains[hostname]

      if (xfwdDomain) {
        proxy.web(req, res, {
          target: `http://localhost:${xfwdDomain.port}`
        })
      }
    })
  }

  async greenlock() {
    const { email, xfwdDomains, sslConfigPath } = this._settings
    const greenlockPath = path.join(sslConfigPath!, 'config.json')
    ensureDirectoryExistence(greenlockPath)

    const config: any = (await requiresTrySimport({ modulesPaths: [greenlockPath] }))[0]
    const greenlockConfig: any = {
      defaults: {
        store: {
          module: 'greenlock-store-fs'
        },
        challenges: {
          'http-01': {
            module: 'acme-http-01-standalone'
          }
        },
        renewOffset: '-45d',
        renewStagger: '3d',
        accountKeyType: 'EC-P256',
        serverKeyType: 'RSA-2048',
        subscriberEmail: email || 'a@b.com'
      },
      sites: [],
      ...config
    }

    greenlockConfig.sites = (greenlockConfig.sites || []).filter((site: any) => xfwdDomains[site.subject])

    const newSsl: string[] = []
    for (const hostKey in xfwdDomains) {
      if (greenlockConfig.sites.some((site: any) => hostKey === site.subject)) {
        continue
      }

      newSsl.push(hostKey)
      greenlockConfig.sites.push({
        subject: hostKey,
        altnames: [hostKey],
        renewAt: 1
      })
    }

    await saveText(greenlockPath, JSON.stringify(greenlockConfig, null, 2))
    return newSsl
  }
}

export { XfwdServer }
