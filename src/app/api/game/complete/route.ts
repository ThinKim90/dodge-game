import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { randomUUID } from 'crypto'

// IP 기반 요청 제한 (게임 완료: 10 req/min)
const gameCompleteLimits = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now()
  const current = gameCompleteLimits.get(ip)
  
  if (!current || now > current.resetTime) {
    gameCompleteLimits.set(ip, { count: 1, resetTime: now + 60000 }) // 1분
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
  score: number
  duration: number
  level: number
}

// 입력 검증 함수
function validateInput(body: unknown): { valid: boolean; error?: string; data?: GameSessionInput } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '잘못된 요청 형식입니다' }
  }
  
  const { score, duration, level } = body as Record<string, unknown>

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
  
  return { 
    valid: true, 
    data: { score, duration, level } as GameSessionInput 
  }
}

// 게임 로직 검증 함수
function validateGameLogic(score: number, level: number, duration: number): { valid: boolean; error?: string } {
  // 기본 범위 검증
  if (score < 0 || score > 100000) {
    return { valid: false, error: '점수가 올바르지 않습니다' }
  }
  
  if (level < 1 || level > 500) {
    return { valid: false, error: '레벨이 올바르지 않습니다' }
  }
  
  if (duration < 1 || duration > 3600) {
    return { valid: false, error: '플레이 시간이 올바르지 않습니다' }
  }
  
  // 점수와 레벨의 일관성 검증 (관대한 검증)
  const expectedLevel = Math.floor(score / 20) + 1 // 20점마다 레벨업
  if (level > expectedLevel + 2) { // 2레벨까지 허용
    return { valid: false, error: '레벨과 점수가 일치하지 않습니다' }
  }
  
  return { valid: true }
}

export async function POST(request: NextRequest) {
  try {
    // IP 주소 추출
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown'
    console.log('🎮 게임 완료 요청 수신:', { ip })

    // IP 기반 요청 제한 (게임 완료: 10 req/min)
    if (!checkRateLimit(ip, 10)) {
      console.log('❌ 게임 완료 요청 제한 초과:', { ip })
      return NextResponse.json(
        { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    // 요청 본문 파싱
    const body = await request.json()
    console.log('🎮 게임 완료 데이터 수신:', { 
      score: body.score, 
      level: body.level, 
      duration: body.duration, 
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

    const { score, duration, level } = validation.data!

    // 2. 세션 정보 조회 (서버 시작 시간 가져오기)
    let serverStartTime: number
    let sessionId: string
    
    // 세션 토큰 추출 (요청 헤더에서)
    const sessionToken = request.headers.get('x-session-token') || ''
    
    if (process.env.POSTGRES_URL && sessionToken) {
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
      // Mock 모드 또는 세션 토큰이 없는 경우
      sessionId = sessionToken ? sessionToken.split('-')[0] : randomUUID()
      serverStartTime = Date.now() - (duration * 1000) // 대략적인 시작 시간
      console.log('🧪 Mock: 세션 정보 가짜 생성')
    }

    // 3. 서버 측 시간 계산
    const serverEndTime = Date.now()
    const serverDuration = serverEndTime - serverStartTime
    const clientEndTime = Date.now() // 클라이언트 종료 시간을 현재 시간으로 가정

    console.log('🕐 시간 검증 데이터:', {
      serverStartTime,
      serverEndTime,
      serverDuration: Math.round(serverDuration / 1000) + '초',
      clientDuration: Math.round(duration * 1000) + '초',
      timeDifference: Math.round(Math.abs(serverDuration - (duration * 1000)) / 1000) + '초'
    })

    // 4. 시간 기반 치팅 방지 검증 (간단한 구현)
    const timeDifference = Math.abs(serverDuration - (duration * 1000))
    const maxTimeDifference = 10000 // 10초 허용 오차
    
    if (timeDifference > maxTimeDifference) {
      console.log('❌ 시간 검증 실패:', { timeDifference: timeDifference / 1000 + '초' })
      return NextResponse.json(
        { 
          error: '게임 시간이 올바르지 않습니다',
          details: `서버-클라이언트 시간 차이: ${Math.round(timeDifference / 1000)}초`
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

    console.log('✅ 게임 세션 검증 통과 - 세션 저장 진행')

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        // 현재 시간을 서버 시작/종료 시간으로 사용 (간단한 구현)
        const now = Date.now()
        const serverStartTime = now - (duration * 1000) // 대략적인 시작 시간
        const serverEndTime = now
        
        // 게임 세션을 데이터베이스에 저장
        const result = await sql`
          INSERT INTO game_sessions (
            session_id, 
            server_start_time, 
            client_start_time, 
            score, 
            level, 
            duration, 
            server_duration, 
            client_duration, 
            status, 
            ip_address, 
            is_used
          )
          VALUES (
            ${sessionId}, 
            ${serverStartTime}, 
            ${serverStartTime}, 
            ${score}, 
            ${level}, 
            ${duration}, 
            ${serverEndTime - serverStartTime}, 
            ${duration * 1000}, 
            'completed', 
            ${ip}, 
            false
          )
          RETURNING session_id, score, level, duration, created_at
        `
        
        console.log('✅ 게임 세션 저장 성공:', result.rows[0])
        
        return NextResponse.json({
          success: true,
          sessionId,
          message: '게임 세션이 저장되었습니다',
          data: result.rows[0]
        })
      } catch (dbError: unknown) {
        console.error('❌ 게임 세션 저장 오류:', dbError)
        
        // 테이블이 없는 경우 Mock 응답
        if (dbError instanceof Error && dbError.message?.includes('relation "game_sessions" does not exist')) {
          console.log('🧪 game_sessions 테이블이 없음 - Mock 응답 반환')
          return NextResponse.json({
            success: true,
            sessionId,
            message: '게임 세션이 저장되었습니다 (개발 모드)',
            data: {
              session_id: sessionId,
              score,
              level,
              duration,
              created_at: new Date().toISOString()
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
      console.log('🧪 Mock: 게임 세션 가짜 응답 반환')
      
      return NextResponse.json({
        success: true,
        sessionId,
        message: '게임 세션이 저장되었습니다 (개발 모드)',
        data: {
          session_id: sessionId,
          score,
          level,
          duration,
          created_at: new Date().toISOString()
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