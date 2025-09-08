# 🎮 Dodge Game - 피하기 게임

Next.js와 Canvas API로 구현한 간단하고 재미있는 피하기 게임입니다.

## ✨ 주요 기능

- 🚀 **Canvas 기반 게임 엔진**: 부드러운 60fps 게임플레이
- 📊 **실시간 리더보드**: 점수 저장 및 순위 표시
- 📱 **반응형 디자인**: 데스크톱과 모바일 모두 지원
- 🎯 **레벨 시스템**: 점수에 따른 난이도 증가
- 🎨 **향상된 그래픽**: 그라데이션 배경과 애니메이션 효과

## 🎯 게임 방법

1. **시작**: 게임 시작 버튼을 클릭하거나 Enter키를 누르세요
2. **조작**: 
   - 데스크톱: ← → 방향키로 이동
   - 모바일: 화면 하단의 좌/우 버튼 터치
3. **목표**: 떨어지는 장애물을 피하며 최대한 높은 점수를 획득하세요
4. **레벨업**: 일정 점수에 도달하면 레벨이 올라가고 난이도가 증가합니다

## 🚀 시작하기

### 개발 환경 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
```

http://localhost:3000에서 게임을 플레이할 수 있습니다.

### 환경 설정

데이터베이스를 사용하려면 `.env.local` 파일을 생성하고 다음 환경변수를 설정하세요:

```bash
# Vercel Postgres 설정
POSTGRES_URL="your_postgres_url"
ALLOWED_ORIGIN="http://localhost:3000"
```

환경변수가 설정되지 않으면 Mock 데이터로 동작합니다.

## 🛠 기술 스택

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Vercel Postgres (선택사항)
- **Deployment**: Vercel

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── scores/          # 점수 저장 API
│   │   │   ├── route.ts     # POST /api/scores
│   │   │   └── top10/       # GET /api/scores/top10
│   │   └── init-db/         # 데이터베이스 초기화
│   ├── page.tsx             # 메인 게임 페이지
│   └── layout.tsx
├── components/
│   ├── DodgeGame.tsx        # 메인 게임 컴포넌트
│   ├── LeaderBoard.tsx      # 리더보드 컴포넌트
│   └── ScoreSubmissionModal.tsx # 점수 저장 모달
└── ...
```

## 🎮 게임 설정

게임의 주요 설정값들은 `DodgeGame.tsx`의 `GAME_CONFIG` 객체에서 조정할 수 있습니다:

- `CANVAS_WIDTH/HEIGHT`: 게임 화면 크기
- `PLAYER_SPEED`: 플레이어 이동 속도
- `SPAWN_RATE`: 장애물 생성 빈도
- `LEVEL_THRESHOLDS`: 레벨업 점수 기준
- `SPEED_MULTIPLIERS`: 레벨별 속도 배율

## 🚀 배포하기

### Vercel 배포

1. Vercel에 프로젝트 연결
2. 환경변수 설정:
   - `POSTGRES_URL`: Vercel Postgres 연결 URL
   - `ALLOWED_ORIGIN`: 배포된 도메인
3. 자동 배포 완료

### 데이터베이스 초기화

배포 후 다음 엔드포인트에 POST 요청을 보내 데이터베이스를 초기화하세요:

```bash
curl -X POST https://your-domain.vercel.app/api/init-db
```

## 📊 API 명세

### POST /api/scores
점수를 저장합니다.

```json
{
  "nickname": "string (2-12자)",
  "score": "number (0-100000)",
  "duration_ms": "number",
  "level": "number (≥1)"
}
```

### GET /api/scores/top10
상위 10개 점수를 조회합니다.

## 🔧 주요 최적화

- **메모리 캐시**: 리더보드 5분 캐싱
- **레이트 리밋**: IP당 분당 5회 제한
- **Mock 모드**: 데이터베이스 없이도 개발 가능
- **반응형 캔버스**: DPR 고려한 고해상도 렌더링

## 🐛 문제 해결

### 게임이 느려요
- 브라우저의 하드웨어 가속이 활성화되어 있는지 확인하세요
- `GAME_CONFIG.MAX_FALLING_OBJECTS` 값을 줄여보세요

### 점수가 저장되지 않아요
- 네트워크 탭에서 API 호출을 확인하세요
- 환경변수가 올바르게 설정되었는지 확인하세요

### 모바일에서 조작이 안 돼요
- 터치 이벤트가 차단되지 않았는지 확인하세요
- iOS Safari의 경우 전체화면 모드를 시도해보세요

## 📝 라이선스

MIT License

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

⭐ 재미있게 플레이하세요! ⭐