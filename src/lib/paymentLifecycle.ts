/**
 * Advisory lock wrapper for P24 payment operations.
 *
 * Prevents concurrent callback and cancel from racing on the same sessionId.
 * Uses pg_advisory_lock (session-level, blocking) — caller gets the lock or waits.
 * Gracefully degrades to no-lock if DB pool is unavailable.
 *
 * @param payload   Payload instance with access to db.pool
 * @param sessionId P24 session ID / groupId used as the lock key
 * @param fn        Critical section to run inside the lock
 */
export async function withPaymentLock<T>(
  payload: any,
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `payment|${sessionId}`
  let lockClient: any = null
  try {
    const dbPool = (payload.db as any)?.pool
    if (!dbPool?.connect) {
      console.warn(`[paymentLock] DB pool unavailable, running without lock. sessionId=${sessionId}`)
      return await fn()
    }
    lockClient = await dbPool.connect()
    await lockClient.query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey])
    return await fn()
  } finally {
    if (lockClient) {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {})
      lockClient.release()
    }
  }
}

/**
 * Non-blocking try-lock variant for cancel operations.
 * Returns null immediately if the lock cannot be acquired (callback is processing).
 */
export async function tryPaymentLock<T>(
  payload: any,
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockKey = `payment|${sessionId}`
  let lockClient: any = null
  let acquired = false
  try {
    const dbPool = (payload.db as any)?.pool
    if (!dbPool?.connect) {
      return await fn()
    }
    lockClient = await dbPool.connect()
    const result = await lockClient.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`, [lockKey])
    acquired = result.rows?.[0]?.acquired === true
    if (!acquired) return null
    return await fn()
  } finally {
    if (lockClient) {
      if (acquired) {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {})
      }
      lockClient.release()
    }
  }
}
