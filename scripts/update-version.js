#!/usr/bin/env node

/**
 * 버전 업데이트 스크립트
 * 사용법: node scripts/update-version.js [새버전]
 * 예시: node scripts/update-version.js 1.3.0
 */

const fs = require('fs')
const path = require('path')

// 명령행 인수에서 새 버전 가져오기
const newVersion = process.argv[2]

if (!newVersion) {
  console.error('❌ 사용법: node scripts/update-version.js [새버전]')
  console.error('예시: node scripts/update-version.js 1.3.0')
  process.exit(1)
}

// 버전 형식 검증 (예: 1.2.3)
const versionRegex = /^\d+\.\d+\.\d+$/
if (!versionRegex.test(newVersion)) {
  console.error('❌ 버전 형식이 올바르지 않습니다. (예: 1.2.3)')
  process.exit(1)
}

console.log(`🚀 버전을 ${newVersion}으로 업데이트 중...`)

// 1. package.json 업데이트
const packageJsonPath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const oldVersion = packageJson.version
packageJson.version = newVersion
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
console.log(`✅ package.json: ${oldVersion} → ${newVersion}`)

// 2. version.ts 업데이트
const versionTsPath = path.join(__dirname, '..', 'src', 'lib', 'version.ts')
let versionTsContent = fs.readFileSync(versionTsPath, 'utf8')

// 버전 문자열 교체
versionTsContent = versionTsContent.replace(
  /version: '[^']+'/,
  `version: '${newVersion}'`
)

// 빌드 날짜 업데이트
const buildDate = new Date().toISOString().split('T')[0]
versionTsContent = versionTsContent.replace(
  /buildDate: '[^']+'/,
  `buildDate: '${buildDate}'`
)

fs.writeFileSync(versionTsPath, versionTsContent)
console.log(`✅ version.ts: ${newVersion} (${buildDate})`)

console.log(`\n🎉 버전 업데이트 완료!`)
console.log(`📦 새 버전: ${newVersion}`)
console.log(`📅 빌드 날짜: ${buildDate}`)
console.log(`\n💡 다음 단계:`)
console.log(`   1. git add .`)
console.log(`   2. git commit -m "chore: bump version to ${newVersion}"`)
console.log(`   3. git tag v${newVersion}`)
console.log(`   4. npm run build`)
console.log(`   5. 배포`)
