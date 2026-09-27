/** 带 HTTP 状态码的错误，供各 composable 做登录过期/权限等分类判断。 */
export class StatusError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

function errorMessageFor(status: number, fallback: string) {
  if (status === 401) return '登录状态已过期，请重新登录。'
  if (status === 403) return '您没有权限操作此展厅。'
  if (status === 404) return '展厅不存在或已被删除。'
  if (status === 409) return '操作冲突，请刷新后重试。'
  if (status === 413) return '上传文件超出大小限制。'
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return fallback
}

/** 读取响应体中的 message 生成用户可读的错误。 */
export async function responseError(response: Response, fallback: string): Promise<StatusError> {
  let message = errorMessageFor(response.status, fallback)
  try {
    const body = await response.json() as { message?: string; code?: string }
    if (response.status < 500 && body.message) message = body.message
  } catch {
    // 响应体不是 JSON 时，按状态码生成的提示已足够。
  }
  return new StatusError(message, response.status)
}
