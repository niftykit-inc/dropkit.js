import { NiftyKitError } from './types'

export function handleError(e: NiftyKitError): void {
  const msg = e?.error?.message || e.message
  // checks if the user has metamask installed
  if (msg.includes('missing provider') || msg.includes('No provider found')) {
    throw new Error(
      'Please install the MetaMask extension. If you are on mobile, open your MetaMask app and browse to this page.'
    )
  }

  if (msg.includes('err: insufficient funds for gas * price + value')) {
    throw new Error('You do not have enough balance.')
  }

  throw e
}
