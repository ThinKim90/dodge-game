'use client'
import { useState } from 'react'
import { GAME_VERSION } from '../lib/version'

interface PatchNotesModalProps {
  isOpen: boolean
  onClose: () => void
  onDontShowToday: () => void
}

const PatchNotesModal = ({ isOpen, onClose, onDontShowToday }: PatchNotesModalProps) => {
  const [isClosing, setIsClosing] = useState(false)
  
  // 현재 날짜를 자동으로 가져오기
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1 // 0부터 시작하므로 +1
  const currentDay = currentDate.getDate()
  
  // 버전 정보 (version.ts에서 가져오기)
  const VERSION = GAME_VERSION.version
  const BUILD_DATE = GAME_VERSION.buildDate
  const DISPLAY_DATE = `${currentYear}년 ${currentMonth}월 ${currentDay}일`

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, 200)
  }

  const handleDontShowToday = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onDontShowToday()
    }, 200)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000] p-4">
      <div className={`bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto transform transition-all duration-200 ${
        isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}>
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">🚀 패치노트</h2>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="p-6">
          {/* 버전 정보 */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-2.5 py-0.5 rounded-full">
                v{VERSION}
              </span>
              <span className="text-gray-400 text-sm">{DISPLAY_DATE}</span>
            </div>
            <div className="text-xs text-gray-500 mb-2">
              빌드: {BUILD_DATE}
            </div>
            <h3 className="text-lg font-semibold text-white mb-3">주요 업데이트</h3>
          </div>

          {/* 패치 내용 */}
          <div className="space-y-4 mb-6">
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-2 flex items-center">
                <span className="mr-2">✨</span>
                게임플레이 개선
              </h4>
              <ul className="text-gray-300 text-sm space-y-1 ml-6">
                <li>• 로켓 이동에 자연스러운 가속도 시스템 추가</li>
                <li>• 히트박스 판정을 원/타원으로 개선하여 더 정확한 충돌 감지</li>
                <li>• 꼼수 방지 시스템으로 공정한 게임플레이 보장</li>
              </ul>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-blue-400 font-semibold mb-2 flex items-center">
                <span className="mr-2">🎨</span>
                UI/UX 개선
              </h4>
              <ul className="text-gray-300 text-sm space-y-1 ml-6">
                <li>• 게임 상태창에 아이콘과 텍스트 라벨 추가</li>
                <li>• 모바일에서 게임/리더보드 탭 네비게이션 추가</li>
                <li>• 모든 버튼과 아이콘을 SVG로 업그레이드</li>
                <li>• 토스트 알림 시스템으로 더 나은 피드백</li>
              </ul>
            </div>

            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-yellow-400 font-semibold mb-2 flex items-center">
                <span className="mr-2">🔧</span>
                기술적 개선
              </h4>
              <ul className="text-gray-300 text-sm space-y-1 ml-6">
                <li>• React Hook 의존성 최적화로 성능 향상</li>
                <li>• 코드 품질 개선 및 ESLint 경고 해결</li>
                <li>• 반응형 디자인 개선</li>
              </ul>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="flex flex-col space-y-3">
            <button
              onClick={handleClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              확인
            </button>
            <button
              onClick={handleDontShowToday}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              오늘 하루 안보기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PatchNotesModal
