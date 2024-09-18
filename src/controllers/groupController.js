const express = require('express');
const db = require('../../models/groupModel'); // 경로 수정

const groupController = express.Router();

// 그룹 등록 라우터
groupController.post('/', async (req, res) => {
    const { name, imageUrl, description, isPublic, password } = req.body;

    const sql = `
        INSERT INTO groups (name, imageUrl, description, isPublic, password, createdAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    try {
        const result = await new Promise((resolve, reject) => {
            db.run(sql, [name, imageUrl, description, isPublic, password], function(err) {
                if (err) {
                    return reject(err);
                }
                resolve(this.lastID);
            });
        });

        // 그룹 생성 후 배지 획득 여부 체크
        const badgeCheckSql = `
            SELECT createdAt, badges FROM groups WHERE id = ?
        `;
        db.get(badgeCheckSql, [result], (err, row) => {
            if (err) {
                console.error("배지 조회 오류:", err.message);
            } else {
                const createdAt = new Date(row.createdAt);
                const currentDate = new Date();
                const diffTime = Math.abs(currentDate - createdAt);
                const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365)); // 연도 차이 계산

                // 배지가 없고 1년이 지났을 때만 '1년 기념' 배지 증가
                if (!row.badges.includes('1년 기념') && diffYears >= 1) {
                    const badgeName = '1년 기념'; // 배지 이름 설정
                    const badgeUpdateSql = `
                        UPDATE groups 
                        SET badges = ?
                        WHERE id = ?
                    `;
                    db.run(badgeUpdateSql, [badgeName, result], (err) => {
                        if (err) {
                            console.error("배지 수 업데이트 오류:", err.message);
                        }
                    });
                }
            }
        });

        res.status(201).json({ id: result, message: '그룹이 성공적으로 등록되었습니다.' });
    } catch (err) {
        console.error("그룹 등록 오류:", err.message);
        res.status(500).json({ error: '그룹 등록에 실패했습니다.' });
    }
});

// 그룹 목록 조회 라우터
groupController.get('/', async (req, res) => {
    const { page = 1, pageSize = 10, sortBy = 'mostLiked', keyword = '', isPublic } = req.query; // 쿼리 파라미터 받기
    let sql = 'SELECT *, (SELECT COUNT(*) FROM posts WHERE groupId = groups.id) AS postCount FROM groups';
    const params = [];
    let whereClauseAdded = false; // WHERE 절이 추가되었는지 여부를 체크하는 변수

    // 검색어 필터링 추가
    if (keyword) {
        sql += ' WHERE name LIKE ? OR description LIKE ?';
        params.push(`%${keyword}%`, `%${keyword}%`);
        whereClauseAdded = true;
    }

    // 공개 그룹 또는 비공개 그룹 필터링
    if (isPublic !== undefined) {
        sql += whereClauseAdded ? ' AND isPublic = ?' : ' WHERE isPublic = ?';
        params.push(isPublic === 'true' ? 1 : 0); // boolean 값 변환
    }

    // 정렬 기준 설정
    const sortOrder = sortBy === 'latest' ? 'createdAt DESC'
                    : sortBy === 'mostPosted' ? 'postCount DESC' // 수정된 부분
                    : sortBy === 'mostBadge' ? 'badges DESC'
                    : 'likeCount DESC'; // 기본값: 공감순

    sql += ` ORDER BY ${sortOrder}`; // 정렬 기준 추가

    // 페이지네이션 설정
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error("그룹 목록 조회 오류:", err.message);
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // 디데이 계산
        const currentDate = new Date();
        const responseRows = rows.map(row => {
            const createdAt = new Date(row.createdAt);
            const diffTime = Math.abs(currentDate - createdAt);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return {
                id: row.id,
                name: row.name,
                imageUrl: row.imageUrl,
                description: row.description,
                isPublic: row.isPublic,
                dDay: diffDays,
                badgeCount: row.badges ? row.badges.split(',').length : 0, // 배지 개수
                postCount: row.postCount, // 수정된 부분
                likeCount: row.likeCount // 수정된 부분
            };
        });

        res.status(200).json({
            currentPage: parseInt(page),
            pageSize: parseInt(pageSize),
            totalCount: rows.length,
            data: responseRows
        });
    } catch (err) {
        console.error("그룹 목록 조회 오류:", err.message);
        res.status(500).json({ error: '그룹 목록을 조회하는 데 실패했습니다.' });
    }
});

// 그룹 공감하기 라우터
groupController.post('/:groupId/like', (req, res) => {
    const { groupId } = req.params;

    const sql = 'UPDATE groups SET likeCount = likeCount + 1 WHERE id = ?';
    db.run(sql, [groupId], async function(err) {
        if (err) {
            console.error("공감 추가 오류:", err.message);
            return res.status(500).json({ error: '공감을 추가하는 데 실패했습니다.' });
        }

        // 배지 획득 여부 확인
        const badgeCheckSql = 'SELECT badges, likeCount FROM groups WHERE id = ?';
        db.get(badgeCheckSql, [groupId], (err, row) => {
            if (err) {
                console.error("배지 조회 오류:", err.message);
            } else {
                // 배지가 없고 공감 수가 10,000개 이상일 때만 '인기 그룹' 배지 증가
                if (!row.badges.includes('인기 그룹') && row.likeCount >= 10000) {
                    const badgeName = '인기 그룹'; // 배지 이름 설정
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
            }
        });

        res.status(200).json({ message: '공감이 추가되었습니다.' });
    });
});

// 그룹 수정 라우터
groupController.put('/:groupId', async (req, res) => {
    const { groupId } = req.params;
    const { name, imageUrl, description, isPublic, password } = req.body;

    // 비밀번호 확인
    const checkPasswordSql = 'SELECT password FROM groups WHERE id = ?';
    db.get(checkPasswordSql, [groupId], async (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }
        if (row.password !== password) {
            return res.status(403).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        const updateSql = `
            UPDATE groups
            SET name = ?, imageUrl = ?, description = ?, isPublic = ?
            WHERE id = ?
        `;

        try {
            await new Promise((resolve, reject) => {
                db.run(updateSql, [name, imageUrl, description, isPublic, groupId], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            });
            res.status(200).json({ message: '그룹이 성공적으로 수정되었습니다.' });
        } catch (err) {
            console.error("그룹 수정 오류:", err.message);
            res.status(500).json({ error: '그룹 수정에 실패했습니다.' });
        }
    });
});

// 그룹 삭제 라우터
groupController.delete('/:groupId', (req, res) => {
    const { groupId } = req.params;
    const { password } = req.body;

    // 비밀번호 확인
    const checkPasswordSql = 'SELECT password FROM groups WHERE id = ?';
    db.get(checkPasswordSql, [groupId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }
        if (row.password !== password) {
            return res.status(403).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        const deleteSql = 'DELETE FROM groups WHERE id = ?';
        db.run(deleteSql, [groupId], (err) => {
            if (err) {
                console.error("그룹 삭제 오류:", err.message);
                return res.status(500).json({ error: '그룹 삭제에 실패했습니다.' });
            }
            res.status(200).json({ message: '그룹이 성공적으로 삭제되었습니다.' });
        });
    });
});

// 비공개 그룹 비밀번호 확인 라우터
groupController.post('/:id/verify-password', async (req, res) => {
    const groupId = req.params.id; // 그룹 ID
    const { password } = req.body; // 비밀번호를 요청 본문에서 받음

    try {
        // 그룹 정보 조회
        const group = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, row) => {
                if (err) {
                    console.error("그룹 조회 오류:", err.message);
                    return reject(err);
                }
                resolve(row);
            });
        });

        // 그룹이 존재하지 않는 경우
        if (!group) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        // 비공개 그룹의 경우 비밀번호 체크
        if (group.isPublic || password !== group.password) {
            return res.status(403).json({ error: '비밀번호가 일치하지 않거나 그룹이 공개입니다.' });
        }

        // 비밀번호가 일치할 경우 성공 응답
        res.status(200).json({ message: '비밀번호가 확인되었습니다.' });
    } catch (err) {
        console.error("비밀번호 확인 오류:", err.message);
        res.status(500).json({ error: '비밀번호 확인에 실패했습니다.' });
    }
});

// 그룹 상세 조회 라우터
groupController.get('/:id', async (req, res) => {
    const groupId = req.params.id; // 그룹 ID

    try {
        // 그룹 정보 조회
        const group = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, row) => {
                if (err) {
                    console.error("그룹 조회 오류:", err.message);
                    return reject(err);
                }
                resolve(row);
            });
        });

        // 그룹이 존재하지 않는 경우
        if (!group) {
            return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
        }

        // 게시글 수 조회
        const postCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as postCount FROM posts WHERE groupId = ?', [groupId], (err, postRow) => {
                if (err) {
                    console.error("게시글 수 조회 오류:", err.message);
                    return resolve(0); // 오류 발생 시 0으로 설정
                }
                resolve(postRow.postCount);
            });
        });

        // 게시물 목록 조회
        const posts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM posts WHERE groupId = ? ORDER BY createdAt DESC', [groupId], (err, rows) => {
                if (err) {
                    console.error("게시물 목록 조회 오류:", err.message);
                    return reject(err);
                }
                resolve(rows);
            });
        });

        // 디데이 계산
        const currentDate = new Date();
        const createdAt = new Date(group.createdAt);
        const diffTime = Math.abs(currentDate - createdAt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 배지 목록 계산
        const badgeNames = {
            '연속 게시글 등록': '연속 게시글 등록',  // 7일 연속 게시글 등록
            '게시글 장인': '게시글 장인',        // 게시글 수 20개 이상
            '1년 기념': '1년 기념',          // 1년 달성
            '인기 그룹': '인기 그룹'          // 공감 1만개 이상
        };

        const badges = []; // 배지 목록을 저장할 배열
        if (group.badges) {
            const groupBadges = group.badges.split(','); // 문자열을 배열로 변환
            groupBadges.forEach(badge => {
                if (badgeNames[badge.trim()]) {
                    badges.push(badgeNames[badge.trim()]); // 배지 이름 추가
                }
            });
        }

        // 그룹 상세 정보 응답
        const response = {
            id: group.id,
            name: group.name,
            imageUrl: group.imageUrl,
            description: group.description,
            isPublic: group.isPublic,
            dDay: diffDays,
            badges: badges,
            postCount: postCount, // 수정된 필드명
            postList: posts, // 게시물 목록
            likeCount: group.likeCount // 수정된 필드명
        };

        res.status(200).json(response);
    } catch (err) {
        console.error("그룹 상세 조회 오류:", err.message);
        res.status(500).json({ error: '그룹 상세 정보를 조회하는 데 실패했습니다.' });
    }
});

// 그룹 공개 여부 확인
groupController.get('/:groupId/is-public', async (req, res) => {
    const { groupId } = req.params;

    // 그룹 ID 유효성 검사
    if (!groupId || isNaN(parseInt(groupId))) {
        return res.status(400).json({ message: '잘못된 요청입니다' });
    }

    // 그룹 공개 여부를 확인하는 쿼리
    const sql = `
        SELECT id, isPublic
        FROM groups
        WHERE id = ?
    `;

    try {
        // 그룹 공개 여부 조회
        const group = await new Promise((resolve, reject) => {
            db.get(sql, [groupId], (err, row) => {
                if (err) {
                    return reject(err);
                }
                resolve(row);
            });
        });

        // 그룹이 존재하지 않는 경우
        if (!group) {
            return res.status(404).json({ message: '존재하지 않는 그룹입니다' });
        }

        // 공개 여부와 그룹 ID 반환
        res.status(200).json({
            id: group.id,
            isPublic: group.isPublic
        });
    } catch (err) {
        console.error("그룹 공개 여부 확인 오류:", err.message);
        res.status(500).json({ message: '그룹 공개 여부 확인에 실패했습니다.' });
    }
});


module.exports = groupController;