'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import LeaderBoard from './LeaderBoard'
import ScoreSubmissionModal from './ScoreSubmissionModal'
import Toast from './Toast'
import PatchNotesModal from './PatchNotesModal'

// 게임 설정
const GAME_CONFIG = {
  CANVAS_WIDTH: 400,
  CANVAS_HEIGHT: 600,
  PLAYER_WIDTH: 22,
  PLAYER_HEIGHT: 32,
  PLAYER_SPEED: 6,
  FALLING_OBJECT_WIDTH: 28,
  FALLING_OBJECT_HEIGHT: 28,
  INITIAL_FALLING_SPEED: 5.25,
  SPAWN_RATE: 0.0525,
  MAX_FALLING_OBJECTS: 22,
  LEVEL_UP_SCORE: 20 // 20점마다 레벨업
}

// 히트박스 설정 (관대한 판정을 위해 스프라이트보다 작게)
const HITBOX_CONFIG = {
  PLAYER_SCALE: {
    rx: 0.35, // 가로 반지름 비율 (너비의 35%)
    ry: 0.45  // 세로 반지름 비율 (높이의 45%)
  },
  METEOR_SCALE: 0.45 // 운석 반지름 비율 (크기의 45%)
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

// 레벨 기반 속도 계산 함수 (적절한 난이도)
const getSpeedByLevel = (level: number): number => {
  // 적절한 난이도 - 점진적 속도 증가
  return GAME_CONFIG.INITIAL_FALLING_SPEED * (1 + 0.5 * (level - 1))
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
  const [gameSessionId, setGameSessionId] = useState<string | null>(null) // 게임 세션 UUID
  const [isSubmittingGameSession, setIsSubmittingGameSession] = useState(false) // 게임 세션 저장 중
  const [showHitboxes, setShowHitboxes] = useState(false) // 히트박스 디버그 모드
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null) // 토스트 알림
  const [mobileTab, setMobileTab] = useState<'game' | 'leaderboard'>('game') // 모바일 탭 상태
  const [showPatchNotes, setShowPatchNotes] = useState(false) // 패치노트 모달 표시
  
  // 꼼수 방지: 플레이어가 같은 위치에 머물러 있는 시간 추적
  const playerIdleTimeRef = useRef<number>(0)
  const lastPlayerPositionRef = useRef<number>(0)
  const lastTargetMeteorTimeRef = useRef<number>(0) // 마지막 타겟팅 운석 생성 시간
  const IDLE_THRESHOLD = 1000 // 1초 (밀리초)
  const TARGET_METEOR_COOLDOWN = 3000 // 3초 (밀리초)
  
  // 로켓 가속도 시스템
  const playerVelocityRef = useRef<number>(0) // 현재 속도
  const ACCELERATION = 0.8 // 가속도 (픽셀/프레임)
  const MAX_SPEED = GAME_CONFIG.PLAYER_SPEED // 최대 속도
  const FRICTION = 0.85 // 마찰력 (감속)
  
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
  
  // 히트박스 타입 정의
  interface EllipseHitbox {
    cx: number // 중심 x
    cy: number // 중심 y
    rx: number // 가로 반지름
    ry: number // 세로 반지름
  }

  interface CircleHitbox {
    cx: number // 중심 x
    cy: number // 중심 y
    radius: number // 반지름
  }

  // 플레이어 타원 히트박스 계산
  const getPlayerEllipseHitbox = useCallback((player: GameObject): EllipseHitbox => {
    return {
      cx: player.x + player.width / 2,
      cy: player.y + player.height / 2,
      rx: (player.width / 2) * HITBOX_CONFIG.PLAYER_SCALE.rx,
      ry: (player.height / 2) * HITBOX_CONFIG.PLAYER_SCALE.ry
    }
  }, [])

  // 운석 원 히트박스 계산
  const getMeteorCircleHitbox = useCallback((meteor: GameObject): CircleHitbox => {
    const radius = (Math.min(meteor.width, meteor.height) / 2) * HITBOX_CONFIG.METEOR_SCALE
    return {
      cx: meteor.x + meteor.width / 2,
      cy: meteor.y + meteor.height / 2,
      radius
    }
  }, [])

  // 타원-원 충돌 판정
  const ellipseVsCircle = useCallback((ellipse: EllipseHitbox, circle: CircleHitbox): boolean => {
    // 원의 중심을 타원의 좌표계로 변환
    const dx = circle.cx - ellipse.cx
    const dy = circle.cy - ellipse.cy
    
    // 타원을 단위원으로 변환하여 거리 계산
    const normalizedDx = dx / ellipse.rx
    const normalizedDy = dy / ellipse.ry
    const distanceSquared = normalizedDx * normalizedDx + normalizedDy * normalizedDy
    
    // 원의 반지름도 같은 비율로 변환
    const transformedRadiusX = circle.radius / ellipse.rx
    const transformedRadiusY = circle.radius / ellipse.ry
    const transformedRadius = Math.sqrt(transformedRadiusX * transformedRadiusX + transformedRadiusY * transformedRadiusY) / Math.sqrt(2)
    
    // 충돌 판정: 변환된 거리가 1 + 변환된 반지름보다 작으면 충돌
    return Math.sqrt(distanceSquared) < (1 + transformedRadius)
  }, [])

  // 새로운 충돌 감지 함수
  const checkCollision = useCallback((player: GameObject, meteor: GameObject): boolean => {
    const playerEllipse = getPlayerEllipseHitbox(player)
    const meteorCircle = getMeteorCircleHitbox(meteor)
    return ellipseVsCircle(playerEllipse, meteorCircle)
  }, [getPlayerEllipseHitbox, getMeteorCircleHitbox, ellipseVsCircle])
  
  // 플레이어 업데이트 (가속도 시스템)
  const updatePlayer = useCallback(() => {
    const player = playerRef.current
    const currentPosition = player.x
    let inputDirection = 0 // 입력 방향 (-1: 왼쪽, 0: 없음, 1: 오른쪽)
    
    // 키보드 입력 방향 계산
    if (keysRef.current['ArrowLeft'] || keysRef.current['a'] || keysRef.current['A']) {
      inputDirection = -1
    }
    if (keysRef.current['ArrowRight'] || keysRef.current['d'] || keysRef.current['D']) {
      inputDirection = 1
    }
    
    // 터치 입력 방향 계산
    if (touchRef.current.isMovingLeft) {
      inputDirection = -1
    }
    if (touchRef.current.isMovingRight) {
      inputDirection = 1
    }
    
    // 가속도 적용
    if (inputDirection !== 0) {
      // 입력이 있으면 가속
      playerVelocityRef.current += inputDirection * ACCELERATION
      // 최대 속도 제한
      playerVelocityRef.current = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, playerVelocityRef.current))
    } else {
      // 입력이 없으면 마찰력으로 감속
      playerVelocityRef.current *= FRICTION
      // 매우 작은 값이면 0으로 설정 (떨림 방지)
      if (Math.abs(playerVelocityRef.current) < 0.1) {
        playerVelocityRef.current = 0
      }
    }
    
    // 위치 업데이트
    const newX = player.x + playerVelocityRef.current
    
    // 화면 경계 체크
    if (newX >= 0 && newX <= GAME_CONFIG.CANVAS_WIDTH - player.width) {
      player.x = newX
    } else {
      // 경계에 닿으면 속도 0으로 설정
      playerVelocityRef.current = 0
      if (newX < 0) {
        player.x = 0
      } else if (newX > GAME_CONFIG.CANVAS_WIDTH - player.width) {
        player.x = GAME_CONFIG.CANVAS_WIDTH - player.width
      }
    }
    
    // 꼼수 방지: 플레이어 위치 변화 추적
    if (Math.abs(currentPosition - lastPlayerPositionRef.current) > 1) {
      // 플레이어가 움직였으면 대기 시간 리셋
      playerIdleTimeRef.current = 0
      lastPlayerPositionRef.current = currentPosition
    } else {
      // 같은 위치에 있으면 대기 시간 증가
      playerIdleTimeRef.current += 16 // 대략 60fps 기준
    }
  }, [MAX_SPEED])

  // 꼼수 방지: 타겟팅 운석 생성 (기존 운석과 별도)
  const spawnTargetMeteor = useCallback(() => {
    const currentTime = performance.now()
    
    // 3초 쿨다운 체크
    if (currentTime - lastTargetMeteorTimeRef.current < TARGET_METEOR_COOLDOWN) {
      return
    }
    
    // 1초 이상 가만히 있는지 체크
    if (playerIdleTimeRef.current < IDLE_THRESHOLD) {
      return
    }
    
    // 타겟팅 운석 생성
    const player = playerRef.current
    const playerCenter = player.x + player.width / 2
    const meteorWidth = GAME_CONFIG.FALLING_OBJECT_WIDTH
    const spawnX = Math.max(0, Math.min(
      GAME_CONFIG.CANVAS_WIDTH - meteorWidth,
      playerCenter - meteorWidth / 2 + (Math.random() - 0.5) * 40 // ±20px 오차
    ))
    
    fallingObjectsRef.current.push({
      x: spawnX,
      y: 0,
      width: GAME_CONFIG.FALLING_OBJECT_WIDTH,
      height: GAME_CONFIG.FALLING_OBJECT_HEIGHT,
      speed: getSpeedByLevel(level)
    })
    
    // 마지막 타겟팅 운석 생성 시간 업데이트
    lastTargetMeteorTimeRef.current = currentTime
    console.log('🎯 꼼수 방지: 타겟팅 운석 1개 생성!', { playerX: player.x, spawnX })
  }, [level])

  // 일반 낙하물 스폰 (기존 로직)
  const spawnFallingObject = useCallback(() => {
    if (fallingObjectsRef.current.length >= GAME_CONFIG.MAX_FALLING_OBJECTS) {
      return
    }
    
    // 레벨에 따른 스폰율 증가 (적절한 난이도 - 최대 2배까지)
    const levelSpawnRate = GAME_CONFIG.SPAWN_RATE * (1 + (level - 1) * 0.15)
    const maxSpawnRate = GAME_CONFIG.SPAWN_RATE * 2 // 최대 2배
    const currentSpawnRate = Math.min(levelSpawnRate, maxSpawnRate)
    
    // 일반 운석 생성
    if (Math.random() < currentSpawnRate) {
      const spawnX = Math.random() * (GAME_CONFIG.CANVAS_WIDTH - GAME_CONFIG.FALLING_OBJECT_WIDTH)
      
      fallingObjectsRef.current.push({
        x: spawnX,
        y: 0,
        width: GAME_CONFIG.FALLING_OBJECT_WIDTH,
        height: GAME_CONFIG.FALLING_OBJECT_HEIGHT,
        speed: getSpeedByLevel(level)
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


  // 게임 완료 시 세션 저장
  const submitGameSession = useCallback(async (finalScore: number, finalLevel: number, finalDuration: number) => {
    if (isSubmittingGameSession) return // 중복 요청 방지
    
    setIsSubmittingGameSession(true)
    
    try {
      console.log('🎮 게임 완료 - 서버에 세션 저장 중...', { finalScore, finalLevel, finalDuration })
      
      const response = await fetch('/api/game/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          score: finalScore,
          level: finalLevel,
          duration: finalDuration
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.sessionId) {
        setGameSessionId(data.sessionId)
        console.log('✅ 게임 세션 저장 성공:', data.sessionId)
      } else {
        console.error('❌ 게임 세션 저장 실패:', data.error)
        setGameSessionId(null)
      }
    } catch (error) {
      console.error('❌ 게임 세션 저장 네트워크 오류:', error)
      setGameSessionId(null)
    } finally {
      setIsSubmittingGameSession(false)
    }
  }, [isSubmittingGameSession])

  // 충돌 체크
  const checkCollisions = useCallback(() => {
    const player = playerRef.current
    
    for (const obj of fallingObjectsRef.current) {
      if (checkCollision(player, obj)) {
        setGameState('gameOver')
        
        // 게임 오버 시 즉시 세션 저장
        const currentTime = Math.floor((performance.now() - startTimeRef.current) / 1000)
        submitGameSession(score, level, currentTime)
        
        return
      }
    }
  }, [score, level, submitGameSession, checkCollision])

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
    
    // 히트박스 디버그 렌더링
    if (showHitboxes) {
      // 플레이어 타원 히트박스 (초록색)
      const playerEllipse = getPlayerEllipseHitbox(playerRef.current)
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(playerEllipse.cx, playerEllipse.cy, playerEllipse.rx, playerEllipse.ry, 0, 0, 2 * Math.PI)
      ctx.stroke()
      
      // 운석 원 히트박스 (주황색)
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 2
      fallingObjectsRef.current.forEach(obj => {
        const meteorCircle = getMeteorCircleHitbox(obj)
        ctx.beginPath()
        ctx.arc(meteorCircle.cx, meteorCircle.cy, meteorCircle.radius, 0, 2 * Math.PI)
        ctx.stroke()
      })
    }
    
    // 레벨업 효과
    if (levelUpEffect) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'
      ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT)
      
      ctx.fillStyle = '#ffff00'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('LEVEL UP!', GAME_CONFIG.CANVAS_WIDTH / 2, GAME_CONFIG.CANVAS_HEIGHT / 2)
    }
    
  }, [levelUpEffect, imagesLoaded, showHitboxes, getPlayerEllipseHitbox, getMeteorCircleHitbox, level])

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
    spawnFallingObject() // 일반 운석 생성
    spawnTargetMeteor() // 타겟팅 운석 생성 (꼼수 방지)
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
    setGameSessionId(null) // 세션 ID 초기화
    setIsSubmittingGameSession(false) // 세션 저장 상태 초기화
    
    // 게임 오브젝트 초기화
    playerRef.current.x = GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.PLAYER_WIDTH / 2
    playerRef.current.y = GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PLAYER_HEIGHT - 20
    fallingObjectsRef.current = []
    
    // 시작 시간 기록
    startTimeRef.current = performance.now()
    lastTimeRef.current = 0
    
    // 꼼수 방지 상태 초기화
    playerIdleTimeRef.current = 0
    lastPlayerPositionRef.current = playerRef.current.x
    lastTargetMeteorTimeRef.current = 0
    
    // 가속도 시스템 초기화
    playerVelocityRef.current = 0
    
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
    setGameState('start') // 점수 등록 후 메인 화면으로 돌아가기
    setMobileTab('leaderboard') // 모바일에서 리더보드 탭으로 이동
    setToast({ message: '점수가 성공적으로 등록되었습니다! 🎉', type: 'success' }) // 성공 토스트 표시
  }
  
  const handleCloseModal = () => {
    setShowModal(false)
  }

  const handleCloseToast = () => {
    setToast(null)
  }

  const handleGoToGame = () => {
    setMobileTab('game')
  }

  // 패치노트 모달 핸들러
  const handleClosePatchNotes = () => {
    setShowPatchNotes(false)
  }

  const handleDontShowToday = () => {
    const today = new Date().toDateString()
    localStorage.setItem('patchNotesLastShown', today)
    setShowPatchNotes(false)
  }

  // 홈으로 가기 함수
  const handleGoHome = () => {
    setGameState('start')
    setScore(0)
    setLevel(1)
    setGameTime(0)
    setMobileTab('game')
  }

  // 패치노트 표시 체크
  useEffect(() => {
    const checkPatchNotes = () => {
      const today = new Date().toDateString()
      const lastShownDate = localStorage.getItem('patchNotesLastShown')
      
      // 오늘 처음 방문하거나, 패치노트를 본 적이 없으면 표시
      if (lastShownDate !== today) {
        setShowPatchNotes(true)
      }
    }

    checkPatchNotes()
  }, [])

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
          setShowModal(true) // 점수 등록 모달 열기
        }
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        setShowHitboxes(prev => !prev)
        console.log('🎯 히트박스 디버그 모드:', !showHitboxes ? '활성화' : '비활성화')
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
      const canvas = canvasRef.current
      if (!canvas) return
      
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      touchRef.current.startX = touch.clientX - rect.left
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      
      const touch = e.touches[0]
      const rect = canvas.getBoundingClientRect()
      const currentX = touch.clientX - rect.left
      const deltaX = currentX - touchRef.current.startX
      const threshold = 20 // 터치 감도 (더 민감하게)

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

    const canvas = canvasRef.current

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    // 캔버스에 터치 이벤트 등록
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      
      if (canvas) {
        canvas.removeEventListener('touchstart', handleTouchStart)
        canvas.removeEventListener('touchmove', handleTouchMove)
        canvas.removeEventListener('touchend', handleTouchEnd)
      }
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current)
      }
    }
  }, [gameState, startGame, restartGame, showHitboxes])

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
    <main className="min-h-screen bg-gray-900 flex items-center justify-center p-2 md:p-4">
      <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-8 w-full max-w-7xl">
        {/* 모바일 탭 네비게이션 */}
        <div className="w-full md:hidden mb-4">
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setMobileTab('game')}
              className={`flex-1 py-3 px-4 rounded-md font-semibold text-sm transition-colors ${
                mobileTab === 'game'
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              🎮 게임
            </button>
            <button
              onClick={() => setMobileTab('leaderboard')}
              className={`flex-1 py-3 px-4 rounded-md font-semibold text-sm transition-colors ${
                mobileTab === 'leaderboard'
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              🏆 리더보드
            </button>
          </div>
        </div>

        {/* 게임 영역 */}
        <div className={`flex flex-col items-center space-y-2 md:space-y-4 w-full md:w-auto ${mobileTab === 'game' ? 'block' : 'hidden md:block'}`}>
          {/* 게임 상태창 */}
          {gameState === 'playing' && (
            <div className="w-full max-w-md bg-gray-800 rounded-lg p-3 mb-2">
              <div className="flex justify-center items-center space-x-6 text-white">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-400">⏱️</span>
                  <span className="text-sm text-gray-300">시간</span>
                  <span className="text-lg font-bold text-blue-400">
                    {gameTime}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400">⭐</span>
                  <span className="text-sm text-gray-300">점수</span>
                  <span className="text-lg font-bold text-yellow-400">
                    {score}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-400">🚀</span>
                  <span className="text-sm text-gray-300">레벨</span>
                  <span className="text-lg font-bold text-green-400">
                    {level}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 캔버스와 오버레이 컨테이너 */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={GAME_CONFIG.CANVAS_WIDTH}
              height={GAME_CONFIG.CANVAS_HEIGHT}
              className="border-2 border-gray-600 bg-gray-800 rounded-lg max-w-full"
              style={{ 
                width: '100%', 
                maxWidth: `${GAME_CONFIG.CANVAS_WIDTH}px`,
                height: 'auto',
                aspectRatio: `${GAME_CONFIG.CANVAS_WIDTH}/${GAME_CONFIG.CANVAS_HEIGHT}`
              }}
            />
            
            {/* 게임 시작 오버레이 */}
            {gameState === 'start' && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center rounded-lg">
                <div className="text-center text-white space-y-4 p-6">
                  <h1 className="text-3xl md:text-4xl font-bold text-blue-400">🎮 피하기 게임</h1>
                  <p className="text-gray-300 text-sm md:text-base">운석을 피해서 살아남으세요!</p>
                  <div className="text-xs md:text-sm text-gray-400 space-y-1">
                    <p>🖥️ 데스크톱: ← → 키로 이동</p>
                    <p>📱 모바일: 화면 드래그 또는 버튼 터치</p>
                  </div>
                  <button
                    onClick={startGame}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold transform hover:scale-105 transition-all text-sm md:text-base"
                  >
                    🚀 게임 시작 (Enter)
                  </button>
                </div>
              </div>
            )}
            
            {/* 게임 오버 오버레이 */}
            {gameState === 'gameOver' && (
              <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center rounded-lg">
                <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
                  {/* 게임 오버 타이틀 */}
                  <div className="p-6 pb-0">
                    <h2 className="text-2xl md:text-3xl font-bold text-white text-center">💥 게임 오버!</h2>
                  </div>
                  
                  {/* 게임 결과 정보 */}
                  <div className="p-6 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="text-center py-3">
                        <div className="text-xs text-gray-400 mb-2">최종 점수</div>
                        <div className="text-xl font-bold text-yellow-400">{score}</div>
                      </div>
                      <div className="text-center py-3">
                        <div className="text-xs text-gray-400 mb-2">플레이 시간</div>
                        <div className="text-xl font-bold text-blue-400">{gameTime}초</div>
                      </div>
                      <div className="text-center py-3">
                        <div className="text-xs text-gray-400 mb-2">도달 레벨</div>
                        <div className="text-xl font-bold text-green-400">{level}</div>
                      </div>
                    </div>
                    
                    {/* 버튼 영역 */}
                    <div className="space-y-3">
                      {/* 다시 시작 & 점수 등록 버튼 */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={restartGame}
                          className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 font-semibold transform hover:scale-105 transition-all text-sm md:text-base"
                        >
                          🔄 다시 시작
                        </button>
                        <button
                          onClick={() => setShowModal(true)}
                          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold transform hover:scale-105 transition-all text-sm md:text-base"
                        >
                          📋 점수 등록
                        </button>
                      </div>
                      
                      {/* 홈으로 버튼 (단독) */}
                      <button
                        onClick={handleGoHome}
                        className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 font-semibold transform hover:scale-105 transition-all text-sm md:text-base"
                      >
                        🏠 홈으로
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          
          
          {/* 모바일 터치 컨트롤 - 게임 바로 아래 고정 */}
          <div className="w-full md:hidden">
            {/* 모바일 터치 버튼 */}
            <div className="flex justify-center space-x-4 mb-2">
              <button
                onTouchStart={(e) => {
                  e.preventDefault()
                  touchRef.current.isMovingLeft = true
                }}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  touchRef.current.isMovingLeft = false
                }}
                onMouseDown={() => {
                  touchRef.current.isMovingLeft = true
                }}
                onMouseUp={() => {
                  touchRef.current.isMovingLeft = false
                }}
                className="w-32 h-16 bg-gray-600 text-white rounded-xl font-bold text-lg select-none active:bg-gray-700 touch-manipulation shadow-lg flex items-center justify-center space-x-2"
                style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>왼쪽</span>
              </button>
              <button
                onTouchStart={(e) => {
                  e.preventDefault()
                  touchRef.current.isMovingRight = true
                }}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  touchRef.current.isMovingRight = false
                }}
                onMouseDown={() => {
                  touchRef.current.isMovingRight = true
                }}
                onMouseUp={() => {
                  touchRef.current.isMovingRight = false
                }}
                className="w-32 h-16 bg-gray-600 text-white rounded-xl font-bold text-lg select-none active:bg-gray-700 touch-manipulation shadow-lg flex items-center justify-center space-x-2"
                style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
              >
                <span>오른쪽</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* 모바일 조작 가이드 */}
            <div className="text-center text-gray-400 text-xs bg-gray-800 rounded-lg p-2">
              📱 화면 드래그 또는 버튼 터치로 이동
            </div>
          </div>
          
          {/* 데스크톱 컨트롤 가이드 */}
          <div className="hidden md:block text-center text-gray-400 text-sm bg-gray-800 rounded-lg p-3">
            🖥️ ← → 키로 이동 | Enter: 시작/점수등록
          </div>
        </div>
        
        {/* 리더보드 */}
        <div className={`w-full md:w-auto mt-4 md:mt-0 ${mobileTab === 'leaderboard' ? 'block' : 'hidden md:block'}`}>
          <LeaderBoard refreshKey={leaderBoardKey} onGoToGame={handleGoToGame} />
        </div>
      </div>
      
      {/* 점수 제출 모달 */}
      <ScoreSubmissionModal
        isOpen={showModal}
        score={score}
        gameTime={gameTime}
        level={level}
        gameSessionId={gameSessionId}
        isSubmittingGameSession={isSubmittingGameSession}
        onClose={handleCloseModal}
        onSubmitSuccess={handleSubmitSuccess}
      />
      
      {/* 패치노트 모달 */}
      <PatchNotesModal
        isOpen={showPatchNotes}
        onClose={handleClosePatchNotes}
        onDontShowToday={handleDontShowToday}
      />
      
      {/* 토스트 알림 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={handleCloseToast}
        />
      )}
    </main>
  )
}

export default DodgeGame