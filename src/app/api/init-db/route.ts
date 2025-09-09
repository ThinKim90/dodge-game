import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // 기존 테이블 삭제 (주의: 모든 데이터 삭제됨)
    await sql`DROP TABLE IF EXISTS scores CASCADE`
    await sql`DROP TABLE IF EXISTS game_sessions CASCADE`
    
    // game_sessions 테이블 생성 (게임 세션 데이터 저장)
    await sql`
      CREATE TABLE game_sessions (
        id SERIAL PRIMARY KEY,
        session_id UUID UNIQUE NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100000),
        duration INTEGER NOT NULL CHECK (duration >= 0),
        level INTEGER NOT NULL CHECK (level >= 1),
        ip_address VARCHAR(45),
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `
    
    // scores 테이블 생성 (UUID 기반 랭킹 테이블)
    await sql`
      CREATE TABLE scores (
        id SERIAL PRIMARY KEY,
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

    console.log('🎮 보안 강화된 데이터베이스 초기화 완료')
    console.log('- game_sessions: 게임 세션 데이터 저장')
    console.log('- scores: UUID 기반 랭킹 시스템')

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
