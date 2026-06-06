const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // API 프록시 처리 (카카오 로드뷰 과거 날짜 API의 브라우저 CORS 회피 목적)
    if (req.url.startsWith('/api/roadview-dates')) {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const panoId = urlObj.searchParams.get('panoId');
        if (!panoId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'panoId 파라미터가 필요합니다.' }));
            return;
        }

        const targetUrl = `https://rv.map.kakao.com/roadview-search/v2/node/${panoId}?SERVICE=csspano`;
        const https = require('https');
        https.get(targetUrl, (apiRes) => {
            let body = '';
            apiRes.on('data', (chunk) => body += chunk);
            apiRes.on('end', () => {
                res.writeHead(200, { 
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(body);
            });
        }).on('error', (err) => {
            console.error('프록시 API 요청 오류:', err);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: '카카오 API 요청에 실패했습니다.' }));
        });
        return;
    }

    // 기본 파일 경로 설정
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    // 파일 확장자 추출
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    // 파일 읽기 및 응답
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 404 에러 처리
                fs.readFile('./404.html', (err404, content404) => {
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(content404 || '<h1>404 Not Found</h1><p>요청하신 파일을 찾을 수 없습니다.</p>', 'utf-8');
                });
            } else {
                // 500 에러 처리
                res.writeHead(500);
                res.end(`서버 오류 발생: ${error.code} ..\n`);
            }
        } else {
            // 정상 응답
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` MapMarker Pro 로컬 개발 서버가 구동되었습니다.`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` 카카오 디벨로퍼스에 등록할 도메인: http://localhost:${PORT}`);
    console.log(`==================================================`);
    console.log(`종료하시려면 터미널에서 Ctrl+C를 누르세요.`);
});
