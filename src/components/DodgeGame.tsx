'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import LeaderBoard from './LeaderBoard'
import ScoreSubmissionModal from './ScoreSubmissionModal'

// 게임 설정
const GAME_CONFIG = {
  CANVAS_WIDTH: 400,
  CANVAS_HEIGHT: 600,
  PLAYER_WIDTH: 40,
  PLAYER_HEIGHT: 40,
  PLAYER_SPEED: 5,
  FALLING_OBJECT_WIDTH: 30,
  FALLING_OBJECT_HEIGHT: 30,
  INITIAL_FALLING_SPEED: 1.5,
  SPAWN_RATE: 0.02,
  MAX_FALLING_OBJECTS: 10,
  LEVEL_UP_SCORE: 30 // 30점마다 레벨업
}

// 타입 정의
type GameState = 'start' | 'playing' | 'gameOver'

interface GameObject {
  x: number
  y: number
  width: number
  height: number
}

interface FallingObject extends GameObject {
  speed: number
}

// 레벨 계산 함수
const getCurrentLevel = (score: number): number => {
  return Math.floor(score / GAME_CONFIG.LEVEL_UP_SCORE) + 1
}

// 레벨 기반 속도 배율 계산 함수
const getSpeedMultiplierByScore = (level: number): number => {
  // 제곱근 기반 + 더욱 완만한 증가율
  return 1 + Math.sqrt(level - 1) * 0.08
}

const DodgeGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number | undefined>(undefined)
  const lastTimeRef = useRef<number>(0)
  
  // 게임 상태
  const [gameState, setGameState] = useState<GameState>('start')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameTime, setGameTime] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [leaderBoardKey, setLeaderBoardKey] = useState(0) // 리더보드 새로고침용
  const [levelUpEffect, setLevelUpEffect] = useState(false)
  
  // 게임 오브젝트
  const playerRef = useRef<GameObject>({
    x: GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.PLAYER_WIDTH / 2,
    y: GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PLAYER_HEIGHT - 20,
    width: GAME_CONFIG.PLAYER_WIDTH,
    height: GAME_CONFIG.PLAYER_HEIGHT
  })
  
  const fallingObjectsRef = useRef<FallingObject[]>([])
  const keysRef = useRef<{[key: string]: boolean}>({})
  const startTimeRef = useRef<number>(0)
  
  // 충돌 감지 함수 (AABB)
  const checkCollision = (rect1: GameObject, rect2: GameObject): boolean => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y
  }
  
  // 플레이어 업데이트
  const updatePlayer = useCallback(() => {
    const player = playerRef.current
    
    if (keysRef.current['ArrowLeft'] && player.x > 0) {
      player.x -= GAME_CONFIG.PLAYER_SPEED
    }
    if (keysRef.current['ArrowRight'] && player.x < GAME_CONFIG.CANVAS_WIDTH - player.width) {
      player.x += GAME_CONFIG.PLAYER_SPEED
    }
  }, [])

  // 낙하물 스폰
  const spawnFallingObject = useCallback(() => {
    if (fallingObjectsRef.current.length >= GAME_CONFIG.MAX_FALLING_OBJECTS) {
      return
    }
    
    if (Math.random() < GAME_CONFIG.SPAWN_RATE) {
      // 현재 레벨(state)에 따라 속도 결정
      const speedMultiplier = getSpeedMultiplierByScore(level)
      
      fallingObjectsRef.current.push({
        x: Math.random() * (GAME_CONFIG.CANVAS_WIDTH - GAME_CONFIG.FALLING_OBJECT_WIDTH),
        y: 0,
        width: GAME_CONFIG.FALLING_OBJECT_WIDTH,
        height: GAME_CONFIG.FALLING_OBJECT_HEIGHT,
        speed: GAME_CONFIG.INITIAL_FALLING_SPEED * speedMultiplier
      })
    }
  }, [level])

  // 낙하물 업데이트 (레벨에 따른 속도 동적 조절)
  const updateFallingObjects = useCallback(() => {
    const currentSpeedMultiplier = getSpeedMultiplierByScore(level)
    
    fallingObjectsRef.current = fallingObjectsRef.current.filter(obj => {
      // 현재 레벨에 맞는 속도로 이동 (동적 속도 조절)
      const currentSpeed = GAME_CONFIG.INITIAL_FALLING_SPEED * currentSpeedMultiplier
      obj.y += currentSpeed
      
      // 화면 아래로 벗어난 객체 제거 및 점수 증가
      if (obj.y > GAME_CONFIG.CANVAS_HEIGHT) {
        setScore(prev => prev + 1)
        return false
      }
      
      return true
    })
  }, [level])

  // 충돌 체크
  const checkCollisions = useCallback(() => {
    const player = playerRef.current
    
    for (const obj of fallingObjectsRef.current) {
      if (checkCollision(player, obj)) {
        setGameState('gameOver')
        setShowModal(true) // 게임 오버 시 모달 표시
        return
      }
    }
  }, [])

  // 게임 렌더링 (개선된 그래픽)
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // 배경 그리기 (그라데이션)
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_CONFIG.CANVAS_HEIGHT)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(0.5, '#16213e')
    gradient.addColorStop(1, '#0f172a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT)
    
    // 별 효과 그리기
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * GAME_CONFIG.CANVAS_WIDTH
      const y = Math.random() * GAME_CONFIG.CANVAS_HEIGHT
      const size = Math.random() * 2
      ctx.fillRect(x, y, size, size)
    }
    
    // 플레이어 그리기 (로켓 모양)
    const player = playerRef.current
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(player.x, player.y, player.width, player.height)
    
    // 로켓 디테일
    ctx.fillStyle = '#60a5fa'
    ctx.fillRect(player.x + 5, player.y + 5, player.width - 10, player.height - 10)
    
    // 로켓 꼭대기
    ctx.fillStyle = '#1d4ed8'
    ctx.beginPath()
    ctx.moveTo(player.x + player.width / 2, player.y)
    ctx.lineTo(player.x + 5, player.y + 15)
    ctx.lineTo(player.x + player.width - 5, player.y + 15)
    ctx.closePath()
    ctx.fill()
    
    // 낙하물 그리기 (레벨별 색상)
    fallingObjectsRef.current.forEach(obj => {
      let color = '#ef4444' // 기본 빨간색
      
      // 현재 레벨별 색상 변경
      if (level >= 5) color = '#8b5cf6' // 보라색  
      else if (level >= 3) color = '#f59e0b' // 주황색
      
      ctx.fillStyle = color
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
      
      // 테두리
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
    })
    
    // 레벨업 효과
    if (levelUpEffect) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'
      ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT)
      
      ctx.fillStyle = '#ffff00'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('LEVEL UP!', GAME_CONFIG.CANVAS_WIDTH / 2, GAME_CONFIG.CANVAS_HEIGHT / 2)
    }
    
  }, [gameState, score, level, levelUpEffect])

  // 게임 루프
  const gameLoop = useCallback((currentTime: number) => {
    if (gameState !== 'playing') return
    
    const elapsedTime = Math.floor((currentTime - startTimeRef.current) / 1000)
    setGameTime(elapsedTime)
    
    // 시간 업데이트 추적
    if (elapsedTime !== lastTimeRef.current) {
      lastTimeRef.current = elapsedTime
    }
    
    const newLevel = getCurrentLevel(score)
    if (newLevel !== level) {
      setLevel(newLevel)
      setLevelUpEffect(true)
      setTimeout(() => setLevelUpEffect(false), 1000) // 1초 후 효과 제거
    }
    
    // 게임 로직 업데이트
    updatePlayer()
    spawnFallingObject()
    updateFallingObjects()
    checkCollisions()
    
    // 렌더링
    render()
    
    // 다음 프레임 요청
    gameLoopRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, score, level, updatePlayer, spawnFallingObject, updateFallingObjects, checkCollisions, render])

  // 게임 시작
  const startGame = useCallback(() => {
    setGameState('playing')
    setScore(0)
    setLevel(1)
    setGameTime(0)
    setLevelUpEffect(false)
    
    // 게임 오브젝트 초기화
    playerRef.current.x = GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.PLAYER_WIDTH / 2
    playerRef.current.y = GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PLAYER_HEIGHT - 20
    fallingObjectsRef.current = []
    
    // 시작 시간 기록
    startTimeRef.current = performance.now()
    lastTimeRef.current = 0
    
  }, [])
  
  // 게임 재시작
  const restartGame = useCallback(() => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current)
    }
    startGame()
  }, [startGame])
  
  // 모달 처리 함수들
  const handleSubmitSuccess = () => {
    setLeaderBoardKey(prev => prev + 1) // 리더보드 새로고침 강제
  }
  
  const handleCloseModal = () => {
    setShowModal(false)
  }

  // 키보드 이벤트 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        keysRef.current[e.key] = true
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (gameState === 'start') {
          startGame()
        } else if (gameState === 'gameOver') {
          restartGame()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        keysRef.current[e.key] = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [gameState, startGame, restartGame])

  // 게임 루프 시작 처리
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }
    
    return () => {
      if (gameLoopRef.current && gameState !== 'playing') {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [gameState, gameLoop])

  // 정적 렌더링 (게임이 시작되지 않았을 때)
  useEffect(() => {
    if (gameState === 'start' || gameState === 'gameOver') {
      render()
    }
  }, [gameState, render])

  return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="flex flex-col lg:flex-row items-start space-y-6 lg:space-y-0 lg:space-x-8">
        {/* 게임 영역 */}
        <div className="flex flex-col items-center space-y-4">
          <canvas
            ref={canvasRef}
            width={GAME_CONFIG.CANVAS_WIDTH}
            height={GAME_CONFIG.CANVAS_HEIGHT}
            className="border-2 border-gray-600 bg-gray-800 rounded-lg"
          />
          
          {/* 게임 정보 */}
          {gameState === 'playing' && (
            <div className="flex space-x-6 text-center text-white bg-gray-800 rounded-lg p-4">
              <div>
                <div className="text-sm text-gray-400">시간</div>
                <div className="text-lg font-bold">{gameTime}초</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">점수</div>
                <div className="text-lg font-bold text-yellow-400">{score}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">레벨</div>
                <div className="text-lg font-bold text-blue-400">{level}</div>
              </div>
            </div>
          )}
          
          {/* 게임 상태별 UI */}
          {gameState === 'start' && (
            <div className="text-center text-white space-y-4">
              <h1 className="text-3xl font-bold text-blue-400">🎮 피하기 게임</h1>
              <p className="text-gray-300">좌/우로 피하세요. 닿으면 끝!</p>
              <button
                onClick={startGame}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold transform hover:scale-105 transition-all"
              >
                🚀 게임 시작 (Enter)
              </button>
            </div>
          )}
          
          {gameState === 'gameOver' && (
            <div className="text-center text-white space-y-4">
              <h2 className="text-2xl font-bold text-red-400">게임 오버!</h2>
              <div className="text-gray-300">
                <p>최종 점수: <span className="text-yellow-400 font-bold">{score}</span></p>
                <p>플레이 시간: <span className="text-blue-400 font-bold">{gameTime}초</span></p>
                <p>도달 레벨: <span className="text-green-400 font-bold">{level}</span></p>
              </div>
              <button
                onClick={restartGame}
                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold transform hover:scale-105 transition-all"
              >
                🔄 다시 시작 (Enter)
              </button>
            </div>
          )}
          
          {/* 모바일 컨트롤 */}
          <div className="text-center text-gray-400 text-sm bg-gray-800 rounded-lg p-3">
            <p>🖥️ 데스크톱: ← → 키로 이동</p>
            <p>📱 모바일: 하단 버튼 터치</p>
          </div>
        </div>
        
        {/* 리더보드 */}
        <div className="w-full lg:w-auto">
          <LeaderBoard key={leaderBoardKey} />
        </div>
      </div>
      
      {/* 점수 제출 모달 */}
      <ScoreSubmissionModal
        isOpen={showModal}
        score={score}
        gameTime={gameTime}
        level={level}
        onClose={handleCloseModal}
        onSubmitSuccess={handleSubmitSuccess}
      />
    </main>
  )
}

export default DodgeGame