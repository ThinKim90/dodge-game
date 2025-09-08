'use client'

import { useState, useEffect } from 'react'

interface Score {
  id: number
  nickname: string
  score: number
  level: number
  created_at: string
}

const LeaderBoard = () => {
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)

  const fetchScores = async () => {
    try {
      const response = await fetch('/api/scores/top10')
      if (response.ok) {
        const data = await response.json()
        setScores(data.scores || [])
      }
    } catch (error) {
      console.error('리더보드 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScores()
  }, [])

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
      <h3 className="text-lg font-bold text-white mb-4 text-center">
        🏆 리더보드
      </h3>
      
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
                key={score.id}
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
      </div>
    </div>
  )
}

export default LeaderBoard