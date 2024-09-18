const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, '.', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 게시물 테이블 생성 함수
const createPostTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            groupId INTEGER NOT NULL,
            nickname TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            postPassword TEXT NOT NULL,
            imageUrl TEXT,
            tags TEXT,
            location TEXT,
            moment DATE,
            isPublic BOOLEAN NOT NULL,
            likeCount INTEGER DEFAULT 0,
            commentCount INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(groupId) REFERENCES groups(id)
        )
    `;

    db.run(sql, (err) => {
        if (err) {
            console.error("테이블 생성 오류:", err.message);
        } else {
            console.log("게시물 테이블이 성공적으로 생성되었습니다.");
        }
    });
};

// 테이블 생성 실행
createPostTable();

module.exports = db;