import { NextResponse } from 'next/server'
import { invalidateCache, clearAllCache } from '@/lib/cache'

export async function POST() {
  try {
    // 리더보드 캐시 무효화
    invalidateCache('leaderboard:top10')
    
    console.log('✅ 리더보드 캐시 무효화 완료')
    
    return NextResponse.json({
      success: true,
      message: '캐시가 성공적으로 무효화되었습니다'
    })
  } catch (error) {
    console.error('❌ 캐시 무효화 오류:', error)
    return NextResponse.json(
      { error: '캐시 무효화 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}

// 모든 캐시 클리어 (관리자용)
export async function DELETE() {
  try {
    clearAllCache()
    
    console.log('✅ 모든 캐시 클리어 완료')
    
    return NextResponse.json({
      success: true,
      message: '모든 캐시가 성공적으로 클리어되었습니다'
    })
  } catch (error) {
    console.error('❌ 전체 캐시 클리어 오류:', error)
    return NextResponse.json(
      { error: '캐시 클리어 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
