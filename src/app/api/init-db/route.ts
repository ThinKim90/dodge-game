import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    // scores 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(12) NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100000),
        duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
        level INTEGER NOT NULL CHECK (level >= 1),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // 인덱스 생성 (성능 최적화)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_scores_leaderboard 
      ON scores(score DESC, created_at DESC)
    `

    console.log('데이터베이스 초기화 완료')

    return NextResponse.json({ 
      ok: true, 
      message: '데이터베이스가 성공적으로 초기화되었습니다' 
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
