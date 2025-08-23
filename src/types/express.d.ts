// Расширения типов Express для AutoFixer
declare namespace Express {
  interface Request {
    githubEvent?: string
    rawBody?: string
  }
}