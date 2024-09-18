const express = require('express');
const db = require('../../models/postModel');
const postController = express.Router();

// 게시글 등록
postController.post('/:groupId/posts', async (req, res) => {
    const { groupId } = req.params;
    const { nickname, title, content, postPassword, groupPassword, imageUrl, tags, location, moment, isPublic } = req.body;

    const sql = `
        INSERT INTO posts (groupId, nickname, title, content, postPassword, imageUrl, tags, location, moment, isPublic)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(sql, [groupId, nickname, title, content, postPassword, imageUrl, tags.join(','), location, moment, isPublic], function(err) {
                if (err) {
                    return reject(err); // 오류 발생 시 reject
                }
                resolve(this.lastID); // 성공 시 마지막 ID 반환
            });
        });

        // 그룹의 게시글 수 증가
        const updateGroupSql = 'UPDATE groups SET postCount = postCount + 1 WHERE id = ?';
        db.run(updateGroupSql, [groupId], (err) => {
            if (err) {
                console.error("게시글 수 업데이트 오류:", err.message);
            }
        });

        // 배지 획득 여부 확인
        const badgeCheckSql = 'SELECT badges, postCount FROM groups WHERE id = ?';
        db.get(badgeCheckSql, [groupId], (err, row) => {
            if (err) {
                console.error("배지 조회 오류:", err.message);
            } else {
                const badges = row.badges || ''; // badges가 undefined일 경우 빈 문자열로 초기화

                // 게시글 수가 20개 이상일 때 '게시글 장인' 배지 증가
                if (!badges.includes('게시글 장인') && row.postCount >= 20) {
                    const badgeName = '게시글 장인'; // 배지 이름 설정
                    const badgeUpdateSql = `
                        UPDATE groups 
                        SET badges = ?
                        WHERE id = ?
                    `;
                    db.run(badgeUpdateSql, [badgeName, groupId], (err) => {
                        if (err) {
                            console.error("배지 수 업데이트 오류:", err.message);
                        }
                    });
                }

                // '연속 게시글 등록' 배지 확인 및 업데이트
                if (!badges.includes('연속 게시글 등록')) {
                    const continuousPostCheckSql = `
                        SELECT COUNT(*) as dayCount 
                        FROM (
                            SELECT DISTINCT DATE(createdAt) as postDate 
                            FROM posts 
                            WHERE groupId = ? AND createdAt >= DATE('now', '-6 days')
                        )
                    `;
                    db.get(continuousPostCheckSql, [groupId], (err, row) => {
                        if (err) {
                            console.error("연속 게시글 조회 오류:", err.message);
                        } else {
                            // 연속 게시글 등록 시 배지 증가
                            if (row.dayCount >= 7) {
                                const continuousBadgeName = '연속 게시글 등록'; // 배지 이름 설정
                                const continuousBadgeUpdateSql = `
                                    UPDATE groups 
                                    SET badges = ?
                                    WHERE id = ? AND badges NOT LIKE '%연속 게시글 등록%'
                                `;
                                db.run(continuousBadgeUpdateSql, [continuousBadgeName, groupId], (err) => {
                                    if (err) {
                                        console.error("연속 배지 수 업데이트 오류:", err.message);
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });

        // 생성된 게시글 정보를 가져옴
        const newPost = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM posts WHERE id = ?', [result], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });

        res.status(201).json(newPost);
    } catch (err) {
        console.error("게시물 등록 오류:", err.message);
        res.status(400).json({ message: '잘못된 요청입니다' });
    }
});

// 게시글 목록 조회
postController.get('/:groupId/posts', async (req, res) => {
    const { groupId } = req.params;
    const { page = 1, pageSize = 10, sortBy = 'mostLiked', keyword = '', isPublic } = req.query;

    // 페이지 및 정렬 설정
    const offset = (page - 1) * pageSize;
    let orderBy = 'likeCount DESC';
    if (sortBy === 'latest') {
      orderBy = 'createdAt DESC';
  } else if (sortBy === 'mostCommented') {
      orderBy = 'commentCount DESC';
  }

    // 검색어 필터링 설정
    const keywordFilter = keyword ? `%${keyword}%` : '%';

    // 공개 여부 필터링 설정
    const publicFilter = isPublic !== undefined ? `AND isPublic = ${isPublic}` : '';

    try {
        // 총 게시글 수 조회
        const totalCountSql = `
            SELECT COUNT(*) as totalItemCount
            FROM posts
            WHERE groupId = ? AND (title LIKE ? OR content LIKE ?) ${publicFilter}
        `;
        const totalItemCount = await new Promise((resolve, reject) => {
            db.get(totalCountSql, [groupId, keywordFilter, keywordFilter], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row.totalItemCount);
            });
        });

        // 총 페이지 수 계산
        const totalPages = Math.ceil(totalItemCount / pageSize);

        // 게시글 목록 조회
        const postsSql = `
            SELECT id, nickname, title, imageUrl, tags, location, moment, isPublic, likeCount, commentCount, createdAt
            FROM posts
            WHERE groupId = ? AND (title LIKE ? OR content LIKE ?) ${publicFilter}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;
        const posts = await new Promise((resolve, reject) => {
            db.all(postsSql, [groupId, keywordFilter, keywordFilter, pageSize, offset], (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // 결과 응답
        res.status(200).json({
            currentPage: page,
            totalPages: totalPages,
            totalItemCount: totalItemCount,
            data: posts,
        });
    } catch (err) {
        console.error("게시글 목록 조회 오류:", err.message);
        res.status(400).json({ message: "잘못된 요청입니다" });
    }
});

// 게시글 수정
postController.put('/:postId', async (req, res) => {
    const { postId } = req.params;
    const { nickname, title, content, postPassword, imageUrl, tags, location, moment, isPublic } = req.body;

    // 요청 본문이 유효한지 검사
    if (!nickname || !title || !content || !postPassword) {
      return res.status(400).json({ message: "잘못된 요청입니다" });
    } 

    // 게시글 비밀번호 확인
    const checkPasswordSql = `
        SELECT postPassword FROM posts WHERE id = ?
    `;

    try {
        // 기존 게시글의 비밀번호를 조회
        const existingPassword = await new Promise((resolve, reject) => {
            db.get(checkPasswordSql, [postId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row ? row.postPassword : null);
            });
        });

        // 게시글이 존재하지 않는 경우
        if (existingPassword === null) {
          return res.status(404).json({ message: "존재하지 않습니다" });
        }

        // 비밀번호가 일치하지 않는 경우
        if (existingPassword !== postPassword) {
          return res.status(403).json({ message: "비밀번호가 틀렸습니다" });
        }

        // 게시글 업데이트 쿼리
        const updateSql = `
            UPDATE posts
            SET nickname = ?, title = ?, content = ?, imageUrl = ?, tags = ?, location = ?, moment = ?, isPublic = ?
            WHERE id = ?
        `;

        const result = await new Promise((resolve, reject) => {
            db.run(updateSql, [nickname, title, content, imageUrl, tags.join(','), location, moment, isPublic, postId], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve(this.changes);
            });
        });

        // 업데이트된 행이 없는 경우
        if (result === 0) {
            return res.status(404).json({ message: '존재하지 않습니다.' });
        }

        // 수정된 게시글을 응답으로 반환
        const updatedPostSql = `
            SELECT * FROM posts WHERE id = ?
        `;
        const updatedPost = await new Promise((resolve, reject) => {
            db.get(updatedPostSql, [postId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });

        res.json(updatedPost);
    } catch (err) {
        console.error("게시글 수정 오류:", err.message);
        res.status(500).json({ message: '게시글 수정에 실패했습니다.' });
    }
});

// 게시글 삭제
postController.delete('/:postId', async (req, res) => {
    const { postId } = req.params;
    const { postPassword } = req.body;

    // 요청 본문이 유효한지 검사
    if (!postPassword) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
    }

    const checkPasswordSql = `
        SELECT postPassword, groupId FROM posts WHERE id = ?
    `;

    try {
        // 게시글 비밀번호 및 그룹 ID 조회
        const existingPost = await new Promise((resolve, reject) => {
            db.get(checkPasswordSql, [postId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });

        // 게시글이 존재하지 않는 경우
        if (!existingPost) {
            return res.status(404).json({ message: "존재하지 않습니다" });
        }

        // 비밀번호가 일치하지 않는 경우
        if (existingPost.postPassword !== postPassword) {
            return res.status(403).json({ message: "비밀번호가 틀렸습니다" });
        }

        // 게시글 삭제 쿼리
        const deleteSql = `
            DELETE FROM posts WHERE id = ?
        `;

        const deleteResult = await new Promise((resolve, reject) => {
            db.run(deleteSql, [postId], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve(this.changes); // 삭제된 행 수 반환
            });
        });

        // 삭제된 행이 없는 경우
        if (deleteResult === 0) {
            return res.status(404).json({ message: "존재하지 않습니다" });
        }

        // 그룹의 게시글 수 감소
        const updateGroupSql = `
            UPDATE groups
            SET postCount = postCount - 1
            WHERE id = ?
        `;

        await new Promise((resolve, reject) => {
            db.run(updateGroupSql, [existingPost.groupId], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });

        res.status(200).json({ message: "게시글 삭제 성공" });
    } catch (err) {
        console.error("게시글 삭제 오류:", err.message);
        res.status(500).json({ message: '게시글 삭제에 실패했습니다.' });
    }
});

// 게시글 상세 정보 조회
postController.get('/:postId', async (req, res) => {
  const { postId } = req.params;

  // 게시글 ID 유효성 검사
  if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json({ message: '잘못된 요청입니다' });
  }

  // 게시글 상세 정보 조회 쿼리
  const sql = `
      SELECT id, groupId, nickname, title, content, imageUrl, tags, location, moment, isPublic, likeCount, commentCount, createdAt
      FROM posts
      WHERE id = ?
  `;

  try {
      // 게시글 상세 정보 조회
      const post = await new Promise((resolve, reject) => {
          db.get(sql, [postId], (err, row) => {
              if (err) {
                  return reject(err);
              }
              resolve(row);
          });
      });

      // 게시글이 존재하지 않는 경우
      if (!post) {
          return res.status(404).json({ message: '게시글이 존재하지 않습니다' });
      }

      // tags를 배열로 변환
      post.tags = post.tags ? post.tags.split(',') : [];

      res.status(200).json(post);
  } catch (err) {
      console.error("게시글 상세 정보 조회 오류:", err.message);
      res.status(500).json({ message: '게시글 조회에 실패했습니다.' });
  }
});

// 게시글 조회 권한 확인
postController.post('/:postId/verify-password', async (req, res) => {
  const { postId } = req.params;
  const { password } = req.body;

  // 요청 본문 검증
  if (!password) {
      return res.status(400).json({ message: '비밀번호가 필요합니다' });
  }

  // 게시글 비밀번호 확인 쿼리
  const sql = `
      SELECT postPassword
      FROM posts
      WHERE id = ?
  `;

  try {
      // 게시글 비밀번호 조회
      const post = await new Promise((resolve, reject) => {
          db.get(sql, [postId], (err, row) => {
              if (err) {
                  return reject(err);
              }
              resolve(row);
          });
      });

      // 게시글이 존재하지 않는 경우
      if (!post) {
          return res.status(404).json({ message: '게시글이 존재하지 않습니다' });
      }

      // 비밀번호 확인
      if (post.postPassword !== password) {
          return res.status(401).json({ message: '비밀번호가 틀렸습니다' });
      }

      res.status(200).json({ message: '비밀번호가 확인되었습니다' });
  } catch (err) {
      console.error("비밀번호 확인 오류:", err.message);
      res.status(500).json({ message: '비밀번호 확인에 실패했습니다.' });
  }
});

// 게시글 공감하기
postController.post('/:postId/like', async (req, res) => {
    const { postId } = req.params;

    // 게시글이 존재하는지 확인하는 쿼리
    const checkPostSql = `
        SELECT id, groupId
        FROM posts
        WHERE id = ?
    `;

    // 게시글 공감 수 증가 쿼리
    const updateLikeCountSql = `
        UPDATE posts
        SET likeCount = likeCount + 1
        WHERE id = ?
    `;

    // 그룹 배지 업데이트 쿼리
    const updateBadgeSql = `
        UPDATE groups
        SET badges = ?
        WHERE id = ? AND badges NOT LIKE '%게시글 공감왕%'
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

        // 게시글 공감 수 증가
        await new Promise((resolve, reject) => {
            db.run(updateLikeCountSql, [postId], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve(this.changes);
            });
        });

        // 그룹의 게시글 공감 수 조회
        const likeCountSql = `
            SELECT SUM(likeCount) AS totalLikes
            FROM posts
            WHERE groupId = ?
        `;

        const totalLikes = await new Promise((resolve, reject) => {
            db.get(likeCountSql, [post.groupId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row.totalLikes);
            });
        });

        // 총 공감 수가 10,000 이상인 경우 배지 부여
        if (totalLikes >= 10000) {
            await new Promise((resolve, reject) => {
                db.run(updateBadgeSql, ['게시글 공감왕', post.groupId], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(this.changes);
                });
            });
        }

        res.status(200).json({ message: '게시글 공감하기 성공' });
    } catch (err) {
        console.error("게시글 공감 오류:", err.message);
        res.status(500).json({ message: '게시글 공감하기에 실패했습니다.' });
    }
});

// 게시글 공개 여부 확인
postController.get('/:postId/is-public', async (req, res) => {
  const { postId } = req.params;

  // 게시글 공개 여부를 확인하는 쿼리
  const checkPublicSql = `
      SELECT id, isPublic
      FROM posts
      WHERE id = ?
  `;

  try {
      // 게시글 공개 여부 조회
      const post = await new Promise((resolve, reject) => {
          db.get(checkPublicSql, [postId], (err, row) => {
              if (err) {
                  return reject(err);
              }
              resolve(row);
          });
      });

      // 게시글이 존재하지 않는 경우
      if (!post) {
          return res.status(404).json({ message: '존재하지 않는 게시글입니다' });
      }

      // 공개 여부와 게시글 ID 반환
      res.status(200).json({
          id: post.id,
          isPublic: post.isPublic
      });
  } catch (err) {
      console.error("게시글 공개 여부 확인 오류:", err.message);
      res.status(500).json({ message: '게시글 공개 여부 확인에 실패했습니다.' });
  }
});

module.exports = postController;
