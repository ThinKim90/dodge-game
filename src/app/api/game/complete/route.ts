import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { randomUUID } from 'crypto'

// 레이트 리밋 체크 (메모리 기반)
interface RateLimitData {
  count: number
  resetTime: number
}
const rateLimitMap = new Map<string, RateLimitData>()

// IP 기반 레이트 리밋 (10req/min) - 게임 완료는 더 자주 일어날 수 있음
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1분
  const limit = 10 // 1분에 10게임까지

  const current = rateLimitMap.get(ip)
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (current.count >= limit) {
    return false
  }
  
  current.count++
  return true
}

// 입력 데이터 타입 정의
interface GameSessionInput {
  sessionToken: string
  score: number
  duration: number
  level: number
  clientEndTime: number
}

// 입력 검증 함수
function validateInput(body: unknown): { valid: boolean; error?: string; data?: GameSessionInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { sessionToken, score, duration, level, clientEndTime } = body as Record<string, unknown>

  // 세션 토큰 검증
  if (typeof sessionToken !== 'string' || sessionToken.length < 10) {
    return { valid: false, error: '유효하지 않은 세션 토큰입니다' }
  }

  // 점수 검증
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100000) {
    return { valid: false, error: '점수가 올바르지 않습니다' }
  }
  
  // 시간 검증
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 0 || duration > 3600) {
    return { valid: false, error: '플레이 시간이 올바르지 않습니다 (최대 1시간)' }
  }
  
  // 레벨 검증
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 500) {
    return { valid: false, error: '레벨이 올바르지 않습니다' }
  }

  // 클라이언트 종료 시간 검증
  if (typeof clientEndTime !== 'number' || clientEndTime <= 0 || clientEndTime > Date.now() + 1000) {
    return { valid: false, error: '유효하지 않은 종료 시간입니다' }
  }
  
  return { 
    valid: true, 
    data: { sessionToken, score, duration, level, clientEndTime } as GameSessionInput 
  }
}

// 🕐 시간 기반 치팅 방지 검증 함수 (서버-클라이언트 시간 차이만 검증)
function validateGameTime({
  clientDuration,
  serverDuration
}: {
  clientDuration: number
  serverDuration: number
}): { valid: boolean; error?: string; details?: any } {
  // 1. 기본 시간 범위 검증
  if (clientDuration < 1000) { // 최소 1초
    return { valid: false, error: '게임 시간이 너무 짧습니다 (최소 1초 필요)' }
  }
  
  if (clientDuration > 3600000) { // 최대 1시간
    return { valid: false, error: '게임 시간이 너무 깁니다 (최대 1시간)' }
  }
  
  // 2. 서버-클라이언트 시간 차이 검증 (핵심!)
  const timeDifference = Math.abs(serverDuration - clientDuration)
  const maxAllowedDifference = 10000 // 10초 허용 오차 (네트워크 지연 고려)
  
  if (timeDifference > maxAllowedDifference) {
    return { 
      valid: false, 
      error: '서버와 클라이언트 시간이 일치하지 않습니다 (시간 조작 의심)',
      details: {
        clientDuration: Math.round(clientDuration / 1000) + '초',
        serverDuration: Math.round(serverDuration / 1000) + '초',
        difference: Math.round(timeDifference / 1000) + '초',
        maxAllowed: Math.round(maxAllowedDifference / 1000) + '초'
      }
    }
  }
  
  console.log('✅ 시간 검증 통과:', {
    clientDuration: Math.round(clientDuration / 1000) + '초',
    serverDuration: Math.round(serverDuration / 1000) + '초',
    difference: Math.round(timeDifference / 1000) + '초'
  })
  
  return { valid: true }
}

// 🛡️ 핵심 게임 로직 검증 함수 (기존 로직 유지)
function validateGameLogic(score: number, level: number, duration: number): { valid: boolean; error?: string } {
  // 레벨과 점수 일관성 검증 (20점마다 레벨업)
  const expectedLevel = Math.floor(score / 20) + 1
  const levelDiff = Math.abs(level - expectedLevel)
  
  if (levelDiff > 3) { // 3레벨 이상 차이나면 의심
    return { valid: false, error: '레벨과 점수가 일치하지 않습니다' }
  }

  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    // IP 주소 추출
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : 
               request.headers.get('x-real-ip') || 
               '127.0.0.1'

    // 레이트 리밋 체크
    if (!checkRateLimit(ip)) {
      console.log(`게임 완료 레이트 리밋 초과: ${ip}`)
      return NextResponse.json(
        { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 요청 본문 파싱
    const body = await request.json()
    console.log('🎮 게임 완료 데이터 수신:', { 
      sessionToken: body.sessionToken,
      score: body.score, 
      level: body.level, 
      duration: body.duration,
      clientEndTime: body.clientEndTime,
      ip 
    })

    // 1. 기본 입력 검증
    const validation = validateInput(body)
    if (!validation.valid) {
      console.log('❌ 게임 완료 입력 검증 실패:', validation.error)
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const { sessionToken, score, duration, level, clientEndTime } = validation.data!

    // 2. 세션 정보 조회 (서버 시작 시간 가져오기)
    let serverStartTime: number
    let sessionId: string
    
    if (process.env.POSTGRES_URL) {
      try {
        // 세션 토큰에서 sessionId 추출 (UUID 형식 유지)
        const tokenParts = sessionToken.split('-')
        if (tokenParts.length >= 5) {
          // UUID 형식: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
          sessionId = tokenParts.slice(0, 5).join('-')
        } else {
          sessionId = sessionToken.split('-')[0]
        }
        
        const sessionResult = await sql`
          SELECT server_start_time, client_start_time, status
          FROM game_sessions
          WHERE session_id = ${sessionId} AND status = 'active'
        `
        
        if (!sessionResult.rows[0]) {
          console.log('❌ 유효하지 않은 세션 또는 이미 완료된 세션')
          return NextResponse.json(
            { error: '유효하지 않은 게임 세션입니다' },
            { status: 400 }
          )
        }
        
        serverStartTime = parseInt(sessionResult.rows[0].server_start_time)
        console.log('✅ 세션 정보 조회 성공:', { sessionId, serverStartTime })
      } catch (dbError) {
        console.error('❌ 세션 조회 오류:', dbError)
        return NextResponse.json(
          { error: '게임 세션 조회 중 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 모드
      sessionId = sessionToken.split('-')[0]
      serverStartTime = Date.now() - (duration * 1000) // 대략적인 시작 시간
      console.log('🧪 Mock: 세션 정보 가짜 생성')
    }

    // 3. 서버 측 시간 계산
    const serverEndTime = Date.now()
    const serverDuration = serverEndTime - serverStartTime
    const clientDuration = clientEndTime - (serverStartTime - (serverEndTime - clientEndTime))

    console.log('🕐 시간 검증 데이터:', {
      serverStartTime,
      serverEndTime,
      serverDuration: Math.round(serverDuration / 1000) + '초',
      clientDuration: Math.round(duration * 1000) + '초',
      timeDifference: Math.round(Math.abs(serverDuration - (duration * 1000)) / 1000) + '초'
    })

    // 4. 시간 기반 치팅 방지 검증 (서버-클라이언트 시간 차이만)
    const timeValidation = validateGameTime({
      clientDuration: duration * 1000, // 초를 밀리초로 변환
      serverDuration
    })
    
    if (!timeValidation.valid) {
      console.log('❌ 시간 검증 실패:', timeValidation.error, timeValidation.details)
      return NextResponse.json(
        { 
          error: timeValidation.error,
          details: timeValidation.details
        },
        { status: 400 }
      )
    }

    // 5. 게임 로직 검증
    const gameValidation = validateGameLogic(score, level, duration)
    if (!gameValidation.valid) {
      console.log('❌ 게임 완료 로직 검증 실패:', gameValidation.error)
      return NextResponse.json(
        { error: gameValidation.error },
        { status: 400 }
      )
    }

    console.log('✅ 시간 기반 치팅 방지 검증 통과 - 세션 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        // 게임 세션을 업데이트 (시간 검증 데이터 포함)
        const result = await sql`
          UPDATE game_sessions 
          SET 
            score = ${score},
            level = ${level},
            duration = ${duration},
            server_duration = ${serverDuration},
            client_duration = ${duration * 1000},
            status = 'completed',
            is_used = false
          WHERE session_id = ${sessionId}
          RETURNING session_id, score, level, duration, server_duration, client_duration, created_at
        `
        
        console.log('✅ 시간 검증된 게임 세션 저장 성공:', result.rows[0])
        
        return NextResponse.json({
          success: true,
          sessionId,
          message: '시간 검증된 게임 세션이 저장되었습니다',
          data: result.rows[0],
          timeValidation: {
            serverDuration: Math.round(serverDuration / 1000) + '초',
            clientDuration: duration + '초',
            scorePerSecond: Math.round((score / (duration || 1)) * 10) / 10
          }
        })
      } catch (dbError: unknown) {
        console.error('❌ 게임 세션 저장 오류:', dbError)
        
        // 테이블이 없는 경우 Mock 응답
        if (dbError instanceof Error && dbError.message?.includes('relation "game_sessions" does not exist')) {
          console.log('🧪 game_sessions 테이블이 없음 - Mock 응답 반환')
          return NextResponse.json({
            success: true,
            sessionId,
            message: '시간 검증된 게임 세션이 저장되었습니다 (개발 모드)',
            data: {
              session_id: sessionId,
              score,
              level,
              duration,
              server_duration: serverDuration,
              client_duration: duration * 1000,
              created_at: new Date().toISOString()
            },
            timeValidation: {
              serverDuration: Math.round(serverDuration / 1000) + '초',
              clientDuration: duration + '초',
              scorePerSecond: Math.round((score / (duration || 1)) * 10) / 10
            }
          })
        }
        
        return NextResponse.json(
          { error: '게임 세션 저장 중 오류가 발생했습니다' },
          { status: 500 }
        )
      }
    } else {
      // Mock 응답 (개발용)
      console.log('🧪 Mock: 시간 검증된 게임 세션 가짜 응답 반환')
      
      return NextResponse.json({
        success: true,
        sessionId,
        message: '시간 검증된 게임 세션이 저장되었습니다 (개발 모드)',
        data: {
          session_id: sessionId,
          score,
          level,
          duration,
          server_duration: serverDuration,
          client_duration: duration * 1000,
          created_at: new Date().toISOString()
        },
        timeValidation: {
          serverDuration: Math.round(serverDuration / 1000) + '초',
          clientDuration: duration + '초',
          scorePerSecond: Math.round((score / (duration || 1)) * 10) / 10
        }
      })
    }

  } catch (error) {
    console.error('❌ 게임 완료 처리 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
