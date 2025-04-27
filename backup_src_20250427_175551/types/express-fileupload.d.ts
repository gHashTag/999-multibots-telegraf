declare module 'express-fileupload' {
  import { Request as ExpressRequest, Response, NextFunction } from 'express'

  interface FileUploadRequest extends ExpressRequest {
    files?: {
      [key: string]: UploadedFile | UploadedFile[]
    } | null
  }

  interface FileUploadOptions {
    createParentPath?: boolean
    uriDecodeFileNames?: boolean
    safeFileNames?: boolean
    preserveExtension?: boolean | number
    abortOnLimit?: boolean
    responseOnLimit?: string
    limitHandler?: (
      req: FileUploadRequest,
      res: Response,
      next: NextFunction
    ) => void
    useTempFiles?: boolean
    tempFileDir?: string
    parseNested?: boolean
    debug?: boolean
    uploadTimeout?: number
    [key: string]: any
  }

  interface FileArray {
    [fieldname: string]: UploadedFile[]
  }

  interface UploadedFile {
    name: string
    encoding: string
    mimetype: string
    data: Buffer
    tempFilePath: string
    truncated: boolean
    size: number
    md5: string
    mv(path: string, callback: (err: any) => void): void
    mv(path: string): Promise<void>
  }

  interface FileUpload {
    name: string
    data: Buffer
    size: number
    encoding: string
    tempFilePath: string
    truncated: boolean
    mimetype: string
    md5: string
    mv: (filePath: string) => Promise<void>
  }

  function fileUpload(
    options?: FileUploadOptions
  ): (req: FileUploadRequest, res: Response, next: NextFunction) => void

  export = fileUpload
}
