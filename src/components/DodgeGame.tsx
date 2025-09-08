'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import LeaderBoard from './LeaderBoard'
import ScoreSubmissionModal from './ScoreSubmissionModal'

// 게임 설정
const GAME_CONFIG = {
  CANVAS_WIDTH: 400,
  CANVAS_HEIGHT: 600,
  PLAYER_WIDTH: 24,
  PLAYER_HEIGHT: 40,
  PLAYER_SPEED: 5,
  FALLING_OBJECT_WIDTH: 30,
  FALLING_OBJECT_HEIGHT: 30,
  INITIAL_FALLING_SPEED: 2.0,
  SPAWN_RATE: 0.02,
  MAX_FALLING_OBJECTS: 10,
  LEVEL_UP_SCORE: 20 // 20점마다 레벨업
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

// 레벨 기반 속도 계산 함수 (스폰 시에만 사용)
const getSpeedByLevel = (level: number): number => {
  // 선형 증가로 안정적인 난이도 조절
  return GAME_CONFIG.INITIAL_FALLING_SPEED * (1 + 0.3 * (level - 1))
}

const DodgeGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number | undefined>(undefined)
  const lastTimeRef = useRef<number>(0)
  const prevTimeRef = useRef<number>(0)
  const loopRef = useRef<(t: number) => void>(() => {})
  
  // 이미지 관련 ref들
  const rocketImageRef = useRef<HTMLImageElement | undefined>(undefined)
  const meteorImages = useRef<HTMLImageElement[]>([])
  
  // 게임 상태
  const [gameState, setGameState] = useState<GameState>('start')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameTime, setGameTime] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [leaderBoardKey, setLeaderBoardKey] = useState(0) // 리더보드 새로고침용
  const [levelUpEffect, setLevelUpEffect] = useState(false)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  
  // 게임 오브젝트
  const playerRef = useRef<GameObject>({
    x: GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.PLAYER_WIDTH / 2,
    y: GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PLAYER_HEIGHT - 20,
    width: GAME_CONFIG.PLAYER_WIDTH,
    height: GAME_CONFIG.PLAYER_HEIGHT
  })
  
  const fallingObjectsRef = useRef<FallingObject[]>([])
  const keysRef = useRef<{[key: string]: boolean}>({})
  const touchRef = useRef<{ 
    isMovingLeft: boolean
    isMovingRight: boolean 
    startX: number
  }>({ isMovingLeft: false, isMovingRight: false, startX: 0 })
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
    
    // 키보드 입력
    if (keysRef.current['ArrowLeft'] && player.x > 0) {
      player.x -= GAME_CONFIG.PLAYER_SPEED
    }
    if (keysRef.current['ArrowRight'] && player.x < GAME_CONFIG.CANVAS_WIDTH - player.width) {
      player.x += GAME_CONFIG.PLAYER_SPEED
    }
    
    // 터치 입력
    if (touchRef.current.isMovingLeft && player.x > 0) {
      player.x -= GAME_CONFIG.PLAYER_SPEED
    }
    if (touchRef.current.isMovingRight && player.x < GAME_CONFIG.CANVAS_WIDTH - player.width) {
      player.x += GAME_CONFIG.PLAYER_SPEED
    }
  }, [])

  // 낙하물 스폰 (스폰 시에만 속도 결정)
  const spawnFallingObject = useCallback(() => {
    if (fallingObjectsRef.current.length >= GAME_CONFIG.MAX_FALLING_OBJECTS) {
      return
    }
    
    if (Math.random() < GAME_CONFIG.SPAWN_RATE) {
      fallingObjectsRef.current.push({
        x: Math.random() * (GAME_CONFIG.CANVAS_WIDTH - GAME_CONFIG.FALLING_OBJECT_WIDTH),
        y: 0,
        width: GAME_CONFIG.FALLING_OBJECT_WIDTH,
        height: GAME_CONFIG.FALLING_OBJECT_HEIGHT,
        speed: getSpeedByLevel(level) // 스폰 시에만 레벨 기반 속도 결정
      })
    }
  }, [level])

  // 낙하물 업데이트 (스폰 시 정한 속도만 사용)
  const updateFallingObjects = useCallback((dt = 1) => {
    fallingObjectsRef.current = fallingObjectsRef.current.filter(obj => {
      // 스폰 시에 정한 obj.speed만 사용 (매 프레임 재계산 안함)
      obj.y += obj.speed * dt
      
      // 화면 아래로 벗어난 객체 제거 및 점수 증가
      if (obj.y > GAME_CONFIG.CANVAS_HEIGHT) {
        setScore(prev => prev + 1)
        return false
      }
      
      return true
    })
  }, [])

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
    
    // 플레이어 그리기 (로켓 이미지 또는 기본 그래픽)
    const player = playerRef.current
    if (imagesLoaded && rocketImageRef.current) {
      // 이미지 사용
      ctx.drawImage(rocketImageRef.current, player.x, player.y, player.width, player.height)
    } else {
      // 기본 그래픽 (fallback)
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
    }
    
    // 낙하물 그리기 (운석 이미지 또는 기본 그래픽)
    fallingObjectsRef.current.forEach(obj => {
      if (imagesLoaded && meteorImages.current.length > 0) {
        // 레벨별 운석 이미지 선택
        const meteorIndex = level >= 5 ? 2 : level >= 3 ? 1 : 0
        const meteorImg = meteorImages.current[meteorIndex]
        if (meteorImg) {
          ctx.drawImage(meteorImg, obj.x, obj.y, obj.width, obj.height)
        }
      } else {
        // 기본 그래픽 (fallback)
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
      }
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
    
  }, [gameState, score, level, levelUpEffect, imagesLoaded])

  // 게임 루프 (RAF 중복 방지)
  loopRef.current = (currentTime: number) => {
    if (gameState !== 'playing') return

    // 프레임 보정 (dt)
    const dt = prevTimeRef.current ? (currentTime - prevTimeRef.current) / 16.6667 : 1
    prevTimeRef.current = currentTime

    // 시간 업데이트
    const elapsedTime = Math.floor((currentTime - startTimeRef.current) / 1000)
    setGameTime(elapsedTime)

    // 레벨 체크 및 업데이트
    const newLevel = getCurrentLevel(score)
    if (newLevel !== level) {
      setLevel(newLevel)
      setLevelUpEffect(true)
      setTimeout(() => setLevelUpEffect(false), 1000)
    }

    // 게임 로직 업데이트
    updatePlayer()
    spawnFallingObject()
    updateFallingObjects(dt) // dt 전달
    checkCollisions()
    render()

    // 다음 프레임 요청
    gameLoopRef.current = requestAnimationFrame(loopRef.current!)
  }

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

    // 터치 이벤트 핸들러
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      touchRef.current.startX = touch.clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchRef.current.startX
      const threshold = 30 // 터치 감도

      if (Math.abs(deltaX) > threshold) {
        touchRef.current.isMovingLeft = deltaX < 0
        touchRef.current.isMovingRight = deltaX > 0
      } else {
        touchRef.current.isMovingLeft = false
        touchRef.current.isMovingRight = false
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      touchRef.current.isMovingLeft = false
      touchRef.current.isMovingRight = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('touchstart', handleTouchStart, { passive: false })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [gameState, startGame, restartGame])

  // RAF 시작/정리 (gameState만 의존하여 중복 방지)
  useEffect(() => {
    if (gameState === 'playing') {
      // 이전 RAF 무조건 취소
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
      prevTimeRef.current = 0
      gameLoopRef.current = requestAnimationFrame(loopRef.current!)
    }
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
        gameLoopRef.current = undefined
      }
    }
  }, [gameState])

  // 이미지 로딩
  useEffect(() => {
    const loadImages = async () => {
      try {
        // 로켓 이미지 로딩
        const rocketImg = new Image()
        rocketImg.src = '/rocket.svg'
        await new Promise<void>((resolve) => {
          rocketImg.onload = () => resolve()
          rocketImg.onerror = () => resolve() // 에러 시에도 계속 진행
        })
        rocketImageRef.current = rocketImg

        // 운석 이미지들 로딩
        const meteorPaths = ['/meteor1.svg', '/meteor2.svg', '/meteor3.svg']
        const meteorImgs = await Promise.all(
          meteorPaths.map(path => {
            const img = new Image()
            img.src = path
            return new Promise<HTMLImageElement>((resolve) => {
              img.onload = () => resolve(img)
              img.onerror = () => resolve(img) // 에러 시에도 계속 진행
            })
          })
        )
        meteorImages.current = meteorImgs
        setImagesLoaded(true)
        console.log('✅ 이미지 로딩 완료!')
      } catch (error) {
        console.warn('⚠️ 이미지 로딩 실패, 기본 그래픽 사용:', error)
        setImagesLoaded(false)
      }
    }
    
    loadImages()
  }, [])

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
            <p className="mb-2">🖥️ 데스크톱: ← → 키로 이동 | 📱 모바일: 화면 드래그</p>
            
            {/* 모바일 터치 버튼 */}
            <div className="flex justify-center space-x-4 mt-3 md:hidden">
              <button
                onTouchStart={() => {
                  touchRef.current.isMovingLeft = true
                }}
                onTouchEnd={() => {
                  touchRef.current.isMovingLeft = false
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold text-xl select-none active:bg-blue-700"
              >
                ← 왼쪽
              </button>
              <button
                onTouchStart={() => {
                  touchRef.current.isMovingRight = true
                }}
                onTouchEnd={() => {
                  touchRef.current.isMovingRight = false
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold text-xl select-none active:bg-blue-700"
              >
                오른쪽 →
              </button>
            </div>
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