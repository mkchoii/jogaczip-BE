const express = require('express');
const db = require('../../models/commentModel');
const commentController = express.Router();

// 댓글 등록
commentController.post('/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const { nickname, content, password } = req.body;

  // 필수 필드 검증
  if (!nickname || !content || !password) {
      return res.status(400).json({ message: "잘못된 요청입니다" });
  }

  // 댓글 등록 쿼리
  const postCommentSql = `
      INSERT INTO comments (postId, nickname, content, password)
      VALUES (?, ?, ?, ?)
  `;

  // 게시글이 존재하는지 확인하는 쿼리
  const checkPostSql = `
      SELECT id
      FROM posts
      WHERE id = ?
  `;

  // 댓글 수 증가 쿼리
  const updateCommentCountSql = `
      UPDATE posts
      SET commentCount = commentCount + 1
      WHERE id = ?
  `;

  try {
      // 게시글 존재 여부 확인
      const post = await new Promise((resolve, reject) => {
        db.get(checkPostSql, [postId], (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row);
        });
    });

    // 게시글이 존재하지 않는 경우
    if (!post) {
        return res.status(404).json({ message: '존재하지 않습니다' });
    }

    // 댓글 등록
    const result = await new Promise((resolve, reject) => {
      db.run(postCommentSql, [postId, nickname, content, password], function (err) {
          if (err) {
              return reject(err);
          }
          resolve(this.lastID);
      });
    });

    // 생성된 댓글 정보를 가져옴
    const newComment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM comments WHERE id = ?', [result], (err, row) => {
          if (err) {
              return reject(err);
          }
          resolve(row);
      });
    });

    // 게시글 댓글 수 증가
    await new Promise((resolve, reject) => {
      db.run(updateCommentCountSql, [postId], function(err) {
        if (err) {
          return reject(err);
        }
        resolve(this.changes);
      });
    });

    res.status(200).json(newComment);
  } catch (err) {
      console.error("댓글 등록 오류:", err.message);
      res.status(400).json({ message: '잘못된 요청입니다' });
  }
});

// 댓글 목록 조회
commentController.get('/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;

    // 페이지 및 정렬 설정
    const offset = (page - 1) * pageSize;

    // SQL 쿼리 준비
    const countSql = `
        SELECT COUNT(*) AS totalItemCount
        FROM comments
        WHERE postId = ?
    `;
    const dataSql = `
        SELECT id, nickname, content, createdAt
        FROM comments
        WHERE postId = ?
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
    `;

    try {
        // 총 댓글 수 조회
        const totalItemCount = await new Promise((resolve, reject) => {
            db.get(countSql, [postId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row.totalItemCount);
            });
        });

        // 댓글 목록 조회
        const comments = await new Promise((resolve, reject) => {
            db.all(dataSql, [postId, pageSize, offset], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // 총 페이지 수 계산
        const totalPages = Math.ceil(totalItemCount / pageSize);

        res.status(200).json({
            currentPage: parseInt(page),
            totalPages: totalPages,
            totalItemCount: totalItemCount,
            data: comments
        });
    } catch (err) {
        console.error("댓글 목록 조회 오류:", err.message);
        res.status(400).json({ message: '잘못된 요청입니다' });
    }
});

// 댓글 수정
commentController.put('/:commentId', async (req, res) => {
  const { commentId } = req.params;
  const { nickname, content, password } = req.body;

  // 요청 본문이 유효한지 검사
  if (!nickname || !content || !password) {
    return res.status(400).json({ message: "잘못된 요청입니다 "});
  }

  // 댓글 비밀번호 확인
  const chekPasswordSql = `
      SELECT password FROM comments WHERE id = ?
  `;

  try {
    // 기존 댓글의 비밀번호 조회
    const existingPassword = await new Promise((resolve, reject) => {
      db.get(chekPasswordSql, [commentId], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row ? row.password : null);
      });
    });

    // 댓글이 존재하지 않는 경우
    if (existingPassword === null) {
      return res.status(404).json({ message: "존재하지 않습니다" });
    }

    // 비밀번호가 일치하지 않는 경우
    if (existingPassword !== password) {
      return res.status(403).json({ messgae: "비밀번호가 틀렸습니다" });
    }

    // 댓글 업데이트 쿼리
    const updateCommentSql = `
        UPDATE comments
        SET nickname = ?, content = ?, password = ?
        WHERE id = ?
    `;

    const result = await new Promise((resolve, reject) => {
      db.run(updateCommentSql, [nickname, content, password, commentId], function(err) {
        if (err) {
          return reject(err);
        }
        resolve(this.changes);
      });
    });

    // 업데이트된 행이 없는 경우
    if (result === 0) {
      return res.status(404).json({ message: '존재하지 않습니다' });
    }

    // 수정된 댓글 반환
    const updatedCommentSql = `
        SELECT * FROM comments WHERE id = ?
    `;
    const updatedComment = await new Promise((resolve, reject) => {
      db.get(updatedCommentSql, [commentId], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });

    res.json(updatedComment);
  } catch (err) {
    console.error("댓글 수정 오류:", err.message);
    res.status(500).json({ message: '댓글 수정에 실패했습니다' });
  }
});

// 댓글 삭제
commentController.delete('/:commentId', async (req, res) => {
  const { commentId } = req.params;
  const { password } = req.body;

  // 요청 본문이 유효한지 검사
  if (!password) {
    return res.status(400).json({ message: "잘못된 요청입니다" });
  }

  const checkPasswordSql = `
      SELECT password, postId FROM comments WHERE id = ?
  `;

  try {
    // 댓글 비밀번호 및 게시글 ID 조회
    const existingComment = await new Promise((resolve, reject) => {
      db.get(checkPasswordSql, [commentId], (err, row) => {
        if (err) {
          return reject(err);
        }
        resolve(row);
      });
    });

    // 댓글이 존재하지 않는 경우
    if (!existingComment) {
      return res.status(404).json({ message: "존재하지 않습니다" });
    }

    // 비밀번호가 일치하지 않는 경우
    if (existingComment.password !== password) {
      return res.status(403).json({ message: "비밀번호가 틀렸습니다" });
    }

    // 댓글 삭제 쿼리
    const deleteSql = `
        DELETE FROM comments WHERE id = ?
    `;

    const deleteResult = await new Promise((resolve, reject) => {
      db.run(deleteSql, [commentId], function(err) {
        if (err) {
          return reject(err);
        }
        resolve(this.changes);
      });
    });

    // 삭제된 행이 없는 경우
    if (deleteResult === 0) {
      return res.status(404).json({ message: "존재하지 않습니다" });
    }

    // 게시글의 댓글 수 감소
    const updatePostSql = `
        UPDATE posts
        SET commentCount = commentCount - 1
        WHERE id = ?
    `;

    await new Promise((resolve, reject) => {
      db.run(updatePostSql, [existingComment.postId], function(err) {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });

    res.status(200).json({ message: "답글 삭제 성공" });
  } catch (err) {
    console.error("댓글 삭제 오류:", err.message);
    res.status(500).json({ message: "댓글 삭제에 실패했습니다" });
  }
});

module.exports = commentController;
