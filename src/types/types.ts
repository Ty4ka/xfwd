export type TXfwdServerSettings = {
  email: string
  appPath: string
  xfwdDomains: TXfwdDomainData
  sslConfigDir?: string
}

export type TXfwdDomainData = {
  [hostname: string]: { port: number }
}
