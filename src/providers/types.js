// Provider interface (JSDoc)
//
// {
//   id: 'wetalk',
//   name: 'WeTalk',
//   host: 'api.wetalkapp.com',
//   describeAccount(account): { title, subtitle }
//   async getCaptcha(device): captcha result
//   async sendEmailCode(email, device, captchaCode, captchaToken): result
//   async registerByEmail(email, code, device): { ok, data, error }
//   async run(env): { ok, summary, logs[] }
// }

export {};
