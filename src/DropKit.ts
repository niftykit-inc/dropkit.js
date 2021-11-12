export default class DropKit {
  apiKey: string

  constructor(key?: string) {
    if (!key) {
      throw new Error('No API key')
    }

    this.apiKey = key
  }
}
