const base = process.env.VITE_API_BASE_URL;
if (!base || !/^https:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(base)) {
  console.error('출시용 API 설정이 필요해요. .env의 VITE_API_BASE_URL에 HTTPS 기본 주소를 입력해 주세요. 로컬 패키징 검토에는 npm run bundle:preview를 사용해요.');
  process.exit(1);
}
if (new URL(base).hostname === 'localhost') {
  console.error('출시용 API는 외부 기기에서 접근 가능한 HTTPS 서버여야 해요.');
  process.exit(1);
}
console.log('출시용 API 설정을 확인했어요. 입점 가능 여부와 실제 API 연결은 별도로 확인해 주세요.');
