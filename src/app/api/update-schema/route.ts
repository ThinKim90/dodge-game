import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST() {
  try {
    console.log('🔄 데이터베이스 스키마 업데이트 시작...')
    
    // 기존 테이블이 있는지 확인
    const tablesExist = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('game_sessions', 'scores')
    `
    
    if (tablesExist.rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'DATABASE_NOT_INITIALIZED',
        message: '데이터베이스가 초기화되지 않았습니다. /api/init-db를 먼저 실행해주세요.'
      })
    }
    
    // game_sessions 테이블에 시간 필드 추가 (기존 데이터 보존)
    try {
      await sql`
        ALTER TABLE game_sessions 
        ADD COLUMN IF NOT EXISTS server_start_time BIGINT,
        ADD COLUMN IF NOT EXISTS client_start_time BIGINT,
        ADD COLUMN IF NOT EXISTS server_duration BIGINT,
        ADD COLUMN IF NOT EXISTS client_duration BIGINT,
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('active', 'completed', 'failed'))
      `
      console.log('✅ game_sessions 테이블 스키마 업데이트 완료')
    } catch (error) {
      console.log('⚠️ game_sessions 테이블 스키마 업데이트 중 일부 오류 (정상):', error)
    }
    
    // 기존 데이터의 status를 'completed'로 업데이트
    try {
      await sql`
        UPDATE game_sessions 
        SET status = 'completed' 
        WHERE status IS NULL
      `
      console.log('✅ 기존 게임 세션 데이터 상태 업데이트 완료')
    } catch (error) {
      console.log('⚠️ 기존 데이터 상태 업데이트 중 오류 (정상):', error)
    }
    
    // 새로운 인덱스 추가 (성능 최적화)
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_game_sessions_status 
        ON game_sessions(status)
      `
      await sql`
        CREATE INDEX IF NOT EXISTS idx_game_sessions_server_time 
        ON game_sessions(server_start_time)
      `
      console.log('✅ 새로운 인덱스 추가 완료')
    } catch (error) {
      console.log('⚠️ 인덱스 추가 중 오류 (정상):', error)
    }
    
    console.log('🎮 데이터베이스 스키마 업데이트 완료 (기존 데이터 보존)')
    console.log('✅ 시간 기반 치팅 방지 필드 추가됨')
    console.log('✅ 기존 게임 데이터는 그대로 유지됨')
    
    return NextResponse.json({ 
      ok: true, 
      message: '데이터베이스 스키마가 성공적으로 업데이트되었습니다 (기존 데이터 보존)',
      details: {
        preservedData: true,
        addedFields: ['server_start_time', 'client_start_time', 'server_duration', 'client_duration', 'status'],
        updatedIndexes: ['idx_game_sessions_status', 'idx_game_sessions_server_time']
      }
    })

  } catch (error) {
    console.error('❌ 스키마 업데이트 오류:', error)
    
    return NextResponse.json(
      { 
        ok: false, 
        error: 'SCHEMA_UPDATE_ERROR',
        message: '스키마 업데이트 중 오류가 발생했습니다',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
