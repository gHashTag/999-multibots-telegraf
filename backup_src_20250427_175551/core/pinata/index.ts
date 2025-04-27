import { PinataSDK } from 'pinata-web3'
import { PINATA_JWT, PINATA_GATEWAY } from '@/config'

export const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT,
  pinataGateway: PINATA_GATEWAY,
})
