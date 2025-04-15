import { Request, Response } from 'express'

export interface CustomRequest extends Request {
  originalUrl: string
  method: string
}

// Расширяем тип Response для поддержки метода status
export interface CustomResponse extends Response {
  status(code: number): this
  json(body: any): this
  send(body: any): this
}
