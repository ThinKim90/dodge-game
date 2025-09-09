import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getFromCache, setCache } from '@/lib/cache'

export async function GET() {
  try {
    const cacheKey = 'leaderboard:top10'
    
    // 캐시 확인
    const cached = getFromCache(cacheKey)
    if (cached) {
      console.log('캐시에서 리더보드 반환')
      return NextResponse.json(cached)
    }

    // 데이터베이스가 설정된 경우 Vercel Postgres 사용
    if (process.env.POSTGRES_URL) {
      try {
        const result = await sql`
          SELECT id, nickname, score, level, created_at 
          FROM scores 
          ORDER BY score DESC, created_at ASC 
          LIMIT 10
        `
        
        const response = {
          success: true,
          scores: result.rows
        }
        
        // 캐시에 저장 (1분 TTL)
        setCache(cacheKey, response, 60 * 1000)
        
        console.log('리더보드 조회 성공:', result.rows.length + '개 항목')
        return NextResponse.json(response)
        
      } catch (dbError) {
        console.error('데이터베이스 오류:', dbError)
        return NextResponse.json(
          { error: '데이터베이스 오류가 발생했습니다', scores: [] },
          { status: 500 }
        )
      }
    } else {
      // Mock 데이터 (개발용)
      console.log('Mock: 데이터베이스가 연결되지 않아 가짜 리더보드를 반환합니다')
      
      const mockScores = [
        { id: 1, nickname: '게임마스터', score: 250, level: 8, created_at: '2024-01-15T10:30:00Z' },
        { id: 2, nickname: '닷지킹', score: 180, level: 6, created_at: '2024-01-15T11:15:00Z' },
        { id: 3, nickname: '피하기고수', score: 145, level: 5, created_at: '2024-01-15T12:00:00Z' },
        { id: 4, nickname: '스피드러너', score: 120, level: 4, created_at: '2024-01-15T13:30:00Z' },
        { id: 5, nickname: '프로게이머', score: 95, level: 3, created_at: '2024-01-15T14:45:00Z' }
      ]
      
      const response = {
        success: true,
        scores: mockScores
      }
      
      // 캐시에 저장 (1분 TTL)
      setCache(cacheKey, response, 60 * 1000)
      
      console.log('리더보드 조회 성공:', mockScores.length + '개 항목')
      return NextResponse.json(response)
    }

  } catch (error) {
    console.error('리더보드 조회 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다', scores: [] },
      { status: 500 }
    )
  }
}