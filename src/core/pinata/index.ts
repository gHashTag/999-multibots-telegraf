// import { PinataSDK } from 'pinata-web3' // Временно отключено
import { PINATA_JWT, PINATA_GATEWAY } from '@/config'

export const pinata = {
  upload: {
    file: () => {
      throw new Error('Pinata temporarily disabled')
    },
  },
} // Заглушка
