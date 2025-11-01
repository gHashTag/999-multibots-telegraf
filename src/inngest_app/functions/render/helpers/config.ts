/**
 * Render Configuration Helper
 * Ported from Python config.py
 *
 * Provides Windows path templates and configuration for render operations
 */

export class RenderConfig {
  // Windows paths
  static readonly WIN_ADMIN_NAME = 'Administrator'
  static readonly WIN_JOB_FOLDER = `C:\\Users\\${RenderConfig.WIN_ADMIN_NAME}\\Desktop\\render-v3\\jobs`

  // Script paths for different render types
  static readonly WIN_SCRIPT_UPDATE_PATH = `C:\\Users\\${RenderConfig.WIN_ADMIN_NAME}\\Desktop\\render-v3\\ae-dev\\update_aep\\script.jsx`
  static readonly WIN_SCRIPT_CREATE_PATH = `C:\\Users\\${RenderConfig.WIN_ADMIN_NAME}\\Desktop\\render-v3\\ae-dev\\create_aep\\script.jsx`

  /**
   * Get job directory path for a specific job
   */
  static getJobDir(jobId: string): string {
    return `${RenderConfig.WIN_JOB_FOLDER}\\${jobId}`
  }

  /**
   * Get template path for a specific job
   */
  static getTemplatePath(jobId: string): string {
    return `${RenderConfig.getJobDir(jobId)}\\template.aep`
  }

  /**
   * Get assets directory path for a specific job
   */
  static getAssetsDir(jobId: string): string {
    return `${RenderConfig.getJobDir(jobId)}\\assets`
  }

  /**
   * Get output file path for a specific job
   */
  static getOutputFile(jobId: string): string {
    return `${RenderConfig.getJobDir(jobId)}\\output.mp4`
  }

  /**
   * Get log file path for a specific job
   */
  static getLogFile(jobId: string): string {
    return `${RenderConfig.getJobDir(jobId)}\\result.log`
  }

  /**
   * Get job.json file path for a specific job
   */
  static getJobFile(jobId: string): string {
    return `${RenderConfig.getJobDir(jobId)}\\job.json`
  }

  /**
   * Get script path based on render type
   */
  static getScriptPath(renderType: 'create' | 'update'): string {
    return renderType === 'update'
      ? RenderConfig.WIN_SCRIPT_UPDATE_PATH
      : RenderConfig.WIN_SCRIPT_CREATE_PATH
  }

  /**
   * Get S3 object key for output file
   */
  static getOutputObjectKey(jobId: string): string {
    return `jobs/${jobId}/results/${jobId}.mp4`
  }

  /**
   * Get proxy configuration from environment
   */
  static getProxyConfig(): { proxy?: string; auth?: string } {
    return {
      proxy: process.env.REMOTE_SERVER_HTTP_PROXY,
      auth: process.env.REMOTE_SERVER_PROXY_AUTH,
    }
  }
}
