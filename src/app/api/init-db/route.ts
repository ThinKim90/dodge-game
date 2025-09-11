import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // 기존 테이블 삭제 (주의: 모든 데이터 삭제됨)
    await sql`DROP TABLE IF EXISTS scores CASCADE`
    await sql`DROP TABLE IF EXISTS game_sessions CASCADE`
    
    // game_sessions 테이블 생성 (완전 UUID 기반 + 시간 검증 필드)
    await sql`
      CREATE TABLE game_sessions (
        session_id UUID PRIMARY KEY,
        server_start_time BIGINT NOT NULL,
        client_start_time BIGINT NOT NULL,
        score INTEGER CHECK (score >= 0 AND score <= 100000),
        duration INTEGER CHECK (duration >= 0),
        level INTEGER CHECK (level >= 1),
        server_duration BIGINT,
        client_duration BIGINT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
        ip_address VARCHAR(45),
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    
    // scores 테이블 생성 (완전 UUID 기반, 외부 노출 ID 제거)
    await sql`
      CREATE TABLE scores (
        score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nickname VARCHAR(12) NOT NULL,
        session_id UUID NOT NULL REFERENCES game_sessions(session_id),
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100000),
        duration INTEGER NOT NULL CHECK (duration >= 0),
        level INTEGER NOT NULL CHECK (level >= 1),
        ip_address VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // 인덱스 생성 (성능 최적화)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scores_leaderboard 
      ON scores(score DESC, created_at DESC)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_game_sessions_session_id 
      ON game_sessions(session_id)
    `
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at 
      ON game_sessions(created_at DESC)
    `

    // 🔒 보안 강화: 중복 등록 방지 제약 조건
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_unique_session 
      ON scores(session_id)
    `

    // 🔒 보안 강화: IP당 시간당 제한을 위한 인덱스
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scores_ip_time 
      ON scores(ip_address, created_at)
    `

    console.log('🎮 시간 기반 치팅 방지 데이터베이스 초기화 완료')
    console.log('✅ 모든 정수 ID가 UUID로 변경됨 (예측 불가능)')
    console.log('✅ 외부 노출 ID 완전 제거')
    console.log('✅ 중복 등록 방지 제약 조건 추가')
    console.log('✅ IP 기반 제한 인덱스 추가')
    console.log('✅ 시간 검증 필드 추가 (서버/클라이언트 시간 추적)')
    console.log('✅ 1초당 최대 10점 제한 검증 준비')
    console.log('- game_sessions: 시간 기반 치팅 방지 게임 세션')
    console.log('- scores: 보안 강화된 랭킹 시스템')

    return NextResponse.json({ 
      ok: true, 
      message: '보안 강화된 데이터베이스가 성공적으로 초기화되었습니다' 
    })

  } catch (error) {
    console.error('데이터베이스 초기화 오류:', error)
    
    return NextResponse.json(
      { 
        ok: false, 
        error: 'DATABASE_INIT_ERROR',
        message: '데이터베이스 초기화 중 오류가 발생했습니다' 
      },
      { status: 500 }
    )
  }
}
