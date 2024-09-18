const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, '.', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 댓글 테이블 생성 함수
const createCommentTable = () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            nickname TEXT NOT NULL,
            content TEXT NOT NULL,
            password TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(postId) REFERENCES posts(id)
        )
    `;

    db.run(sql, (err) => {
        if (err) {
            console.error("테이블 생성 오류:", err.message);
        } else {
            console.log("댓글 테이블이 성공적으로 생성되었습니다.");
        }
    });
};

createCommentTable();

module.exports = db;
