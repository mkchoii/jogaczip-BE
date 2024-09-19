const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, '.', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 그룹 테이블 생성 함수
const createGroupsTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            imageUrl TEXT NOT NULL,
            introduction TEXT,
            isPublic BOOLEAN NOT NULL,
            password TEXT NOT NULL,
            likeCount INTEGER DEFAULT 0, 
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, 
            badges TEXT DEFAULT '',  -- 배지를 문자열로 저장
            postCount INTEGER DEFAULT 0 
        )
    `;

    db.run(sql, (err) => {
        if (err) {
            console.error("테이블 생성 오류:", err.message);
        } else {
            console.log("그룹 테이블이 성공적으로 생성되었습니다.");
        }
    });
};

// 테이블 생성 실행
createGroupsTable();

// 모듈 내보내기
module.exports = db;