import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { invalidateCache } from '@/lib/cache'

export async function POST() {
  try {
    // 환경변수 확인
    if (!process.env.POSTGRES_URL) {
      return NextResponse.json(
        { 
          ok: false,
          error: 'DATABASE_NOT_CONFIGURED',
          message: '데이터베이스가 설정되지 않았습니다' 
        },
        { status: 500 }
      )
    }

    // 모든 점수 데이터 삭제
    const result = await sql`DELETE FROM scores`
    
    // 캐시 무효화
    invalidateCache('leaderboard:top10')
    
    console.log(`점수 데이터 초기화 완료: ${result.rowCount}개 행 삭제됨`)

    return NextResponse.json({ 
      ok: true, 
      message: `리더보드가 초기화되었습니다. ${result.rowCount}개의 기록이 삭제되었습니다.`,
      deletedCount: result.rowCount
    })

  } catch (error) {
    console.error('점수 데이터 초기화 오류:', error)
    
    return NextResponse.json(
      { 
        ok: false, 
        error: 'CLEAR_SCORES_ERROR',
        message: '점수 데이터 초기화 중 오류가 발생했습니다' 
      },
      { status: 500 }
    )
  }
}
