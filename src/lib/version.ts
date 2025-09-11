// 게임 버전 정보 관리
export const GAME_VERSION = {
  version: '1.2.0',
  buildDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD 형식
  releaseNotes: [
    '로켓 이동에 자연스러운 가속도 시스템 추가',
    '히트박스 판정을 원/타원으로 개선하여 더 정확한 충돌 감지',
    '꼼수 방지 시스템으로 공정한 게임플레이 보장',
    '게임 상태창에 아이콘과 텍스트 라벨 추가',
    '모바일에서 게임/리더보드 탭 네비게이션 추가',
    '모든 버튼과 아이콘을 SVG로 업그레이드',
    '토스트 알림 시스템으로 더 나은 피드백',
    'React Hook 의존성 최적화로 성능 향상',
    '코드 품질 개선 및 ESLint 경고 해결',
    '반응형 디자인 개선'
  ]
}

// 버전 비교 함수
export const compareVersions = (version1: string, version2: string): number => {
  const v1parts = version1.split('.').map(Number)
  const v2parts = version2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0
    const v2part = v2parts[i] || 0
    
    if (v1part > v2part) return 1
    if (v1part < v2part) return -1
  }
  
  return 0
}

// 버전 업데이트 함수 (개발용)
export const updateVersion = (newVersion: string) => {
  GAME_VERSION.version = newVersion
  GAME_VERSION.buildDate = new Date().toISOString().split('T')[0]
}
