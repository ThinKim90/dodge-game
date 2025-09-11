'use client'

import { useState, useEffect } from 'react'

interface Score {
  nickname: string
  score: number
  level: number
  created_at: string
}

interface LeaderBoardProps {
  refreshKey?: number // 새로고침을 위한 prop
  onGoToGame?: () => void // 게임으로 이동하는 함수
}

const LeaderBoard = ({ refreshKey, onGoToGame }: LeaderBoardProps) => {
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchScores = async () => {
    setLoading(true)
    try {
      console.log('리더보드 새로고침 시작...')
      const response = await fetch('/api/scores/top10', {
        cache: 'no-cache', // 캐시 무시
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      if (response.ok) {
        const data = await response.json()
        console.log('리더보드 데이터:', data)
        setScores(data.scores || [])
      } else {
        console.error('리더보드 응답 오류:', response.status)
      }
    } catch (error) {
      console.error('리더보드 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  // 강제 새로고침 (캐시 무효화 + 데이터 재로드)
  const handleForceRefresh = async () => {
    if (refreshing) return
    
    setRefreshing(true)
    try {
      console.log('🔄 강제 새로고침 시작 - 캐시 무효화 중...')
      
      // 1. 캐시 무효화
      await fetch('/api/cache/clear', {
        method: 'POST'
      })
      
      // 2. 잠시 대기 후 데이터 재로드
      setTimeout(() => {
        fetchScores()
        setRefreshing(false)
      }, 500)
      
    } catch (error) {
      console.error('강제 새로고침 실패:', error)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchScores()
  }, [refreshKey]) // refreshKey가 변경될 때마다 새로고침

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR')
  }

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `${rank}.`
    }
  }

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'text-yellow-400 font-bold'
      case 2: return 'text-gray-300 font-bold'
      case 3: return 'text-amber-600 font-bold'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">
          🏆 리더보드
        </h3>
        <button
          onClick={handleForceRefresh}
          disabled={refreshing || loading}
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white disabled:text-gray-600 transition-colors rounded-lg hover:bg-gray-700 disabled:hover:bg-transparent"
          title="강제 새로고침 (캐시 무효화)"
        >
          <svg 
            className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
        </button>
      </div>
      
      {loading ? (
        <div className="text-center text-gray-400">로딩 중...</div>
      ) : scores.length === 0 ? (
        <div className="text-center text-gray-400">
          아직 기록이 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {scores.map((score, index) => {
            const rank = index + 1
            return (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded ${
                  rank <= 3 ? 'bg-gray-700' : 'bg-gray-750'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className={`text-sm font-mono ${getRankStyle(rank)}`}>
                    {getRankEmoji(rank)}
                  </span>
                  <div>
                    <div className={`font-semibold ${getRankStyle(rank)}`}>
                      {score.nickname}
                    </div>
                    <div className="text-xs text-gray-500">
                      Lv.{score.level} • {formatDate(score.created_at)}
                    </div>
                  </div>
                </div>
                <div className={`font-bold ${getRankStyle(rank)}`}>
                  {score.score}
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      <div className="mt-4 pt-3 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">
          상위 10위까지 표시됩니다
        </p>
        <p className="text-xs text-gray-600 text-center mt-1">
          💡 데이터가 업데이트되지 않으면 ↻ 버튼을 클릭하세요
        </p>
      </div>
      
      {/* 게임하러가기 버튼 (모바일에서만 표시) */}
      {onGoToGame && (
        <div className="md:hidden mt-4">
          <button
            onClick={onGoToGame}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>게임하러가기</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default LeaderBoard