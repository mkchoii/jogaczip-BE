const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 라우터 생성
const router = express.Router();

// 이미지 저장 경로 및 파일명 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads'); // 절대 경로 사용
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // 폴더가 없으면 생성
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // 확장자 추출
    cb(null, file.fieldname + '-' + Date.now() + ext); // 확장자 포함
  },
});

// multer 설정
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 최대 파일 크기 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('이미지 파일만 업로드 가능합니다.');
      error.code = 'LIMIT_FILE_TYPES';
      return cb(error, false);
    }
    cb(null, true);
  },
});

// 이미지 업로드 API
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '파일이 업로드되지 않았습니다.' });
  }

  // 이미지 URL 생성
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  res.status(200).json({ imageUrl });
});

// 정적 파일 제공 (이미지 파일 접근용)
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

module.exports = router;
