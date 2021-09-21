export type TXfwdServerSettings = {
  email: string
  appPath: string
  xfwdDomains: TXfwdDomainData
  sslConfigPath?: string
}

export type TXfwdDomainData = {
  [hostname: string]: { port: number }
}
