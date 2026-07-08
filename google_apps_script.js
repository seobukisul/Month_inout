// Google Apps Script - 100% Cloud MOTIE Report Automation
// 이 스크립트를 사용하면 깃허브 액션 없이 구글 클라우드에서 100% 무료 및 자동으로 동작합니다.

const GEMINI_API_KEY = "여기에_제미나이_API_키_입력";

// 1. 수신 이메일 주소 설정 (여러 명에게 발송 시 콤마(,)로 구분하여 입력 가능)
// 예: "receiver1@gmail.com, receiver2@naver.com"
const EMAIL_RECEIVER = "seobukisul@gmail.com"; 

const GOOGLE_DRIVE_FOLDER_ID = "https://drive.google.com/drive/folders/1nhPqK4FAUaj9Q42pPTlM5XxdFyjOjurj?usp=drive_link"; // 옵션: 구글 드라이브 특정 폴더 ID (전체 주소 또는 ID 입력 가능)

function runMonthlyReport() {
  var now = new Date();
  var targetMonth = now.getMonth(); // getMonth()는 0-11 이므로 7월에 실행하면 6이 나옴 (즉, 6월)
  var targetYear = now.getFullYear();
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear -= 1;
  }
  
  Logger.log("대상: " + targetYear + "년 " + targetMonth + "월 수출입 동향");
  
  // 1. 게시판 검색
  var baseUrl = "https://www.motir.go.kr";
  var searchUrl = baseUrl + "/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=" + encodeURIComponent("수출입 동향");
  
  var response = UrlFetchApp.fetch(searchUrl, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  
  var html = response.getContentText("UTF-8");
  var cookieHeader = getCookieHeader(response);
  Logger.log("검색 페이지 획득 쿠키: " + (cookieHeader ? cookieHeader : "없음"));
  
  // HTML 파싱 (Regex 사용)
  var trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  var match;
  var targetRowHtml = null;
  var postTitle = null;
  var articleId = null;
  
  while ((match = trPattern.exec(html)) !== null) {
    var rowHtml = match[1];
    if (rowHtml.indexOf("article.view") !== -1) {
      // 제목 추출
      var titleMatch = rowHtml.match(/<a[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) {
        titleMatch = rowHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      }
      if (titleMatch) {
        var title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
        if (title.indexOf(targetYear + "년") !== -1 && 
            title.indexOf(targetMonth + "월") !== -1 && 
            title.indexOf("수출입") !== -1 && 
            title.indexOf("동향") !== -1 && 
            title.indexOf("정보통신") === -1) {
          targetRowHtml = rowHtml;
          postTitle = title;
          
          // articleSeq ID 추출
          var idMatch = rowHtml.match(/article\.view\('(\d+)'\)/);
          if (idMatch) {
            articleId = idMatch[1];
          }
          break;
        }
      }
    }
  }
  
  if (!articleId) {
    Logger.log("이번 달 게시물을 찾지 못했습니다.");
    return;
  }
  
  Logger.log("게시물 발견: " + postTitle + " (ID: " + articleId + ")");
  
  // 2. 상세 페이지 방문 (진짜 상세페이지 URL: /kor/article/ATCL3f49a5a8c/ID/view)
  var detailUrl = baseUrl + "/kor/article/ATCL3f49a5a8c/" + articleId + "/view";
  Logger.log("상세 페이지 방문 중: " + detailUrl);
  
  var detailResponse = UrlFetchApp.fetch(detailUrl, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookieHeader,
      "Referer": searchUrl
    }
  });
  
  var detailHtml = detailResponse.getContentText("UTF-8");
  
  // 상세 페이지 쿠키 추가 수집
  var detailCookie = getCookieHeader(detailResponse);
  if (detailCookie) {
    cookieHeader = cookieHeader ? cookieHeader + "; " + detailCookie : detailCookie;
  }
  Logger.log("상세 페이지 결합 쿠키: " + (cookieHeader ? cookieHeader : "없음"));
  
  // 하단 기사목록 테이블(mytable)을 제거하여 본문 첨부파일만 남김
  var cleanHtml = detailHtml.replace(/<table[^>]*id="mytable"[\s\S]*?<\/table>/gi, "");
  
  // PDF 첨부파일 링크 추출
  var attachPattern = /\/attach\/down\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+/g;
  var attachMatches = cleanHtml.match(attachPattern);
  
  if (!attachMatches) {
    Logger.log("상세 페이지 본문에서 첨부파일 링크를 찾지 못했습니다.");
    return;
  }
  
  // PDF가 포함된 링크 찾기
  var fileUrl = null;
  for (var i = 0; i < attachMatches.length; i++) {
    var linkPos = cleanHtml.indexOf(attachMatches[i]);
    var surroundingText = cleanHtml.substring(linkPos, linkPos + 250).toLowerCase();
    if (surroundingText.indexOf(".pdf") !== -1) {
      fileUrl = baseUrl + attachMatches[i];
      Logger.log("PDF 첨부파일 감지: " + fileUrl);
      break;
    }
  }
  
  // 만약 못 찾으면 첫 번째 첨부파일 사용
  if (!fileUrl) {
    fileUrl = baseUrl + attachMatches[0];
    Logger.log("PDF 감지 실패, 첫 번째 첨부파일로 다운로드 시도: " + fileUrl);
  }
  
  // PDF 다운로드 (브라우저와 동일한 헤더 사용)
  var pdfResponse = UrlFetchApp.fetch(fileUrl, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      "Cookie": cookieHeader,
      "Referer": detailUrl
    }
  });
  
  var pdfBlob = pdfResponse.getBlob();
  var content = pdfBlob.getBytes();
  
  // PDF 확인 (%PDF로 시작하는지)
  var isPdf = (content[0] === 0x25 && content[1] === 0x50 && content[2] === 0x44 && content[3] === 0x46); // %PDF
  if (!isPdf) {
    Logger.log("다운로드된 파일이 PDF 형식이 아닙니다. 응답 크기: " + content.length + " bytes");
    return;
  }
  
  // 3. 구글 드라이브에 PDF 저장
  var folderId = GOOGLE_DRIVE_FOLDER_ID.trim();
  
  // 사용자가 폴더 전체 URL을 입력했을 경우 ID만 추출하는 지능형 파싱 적용
  if (folderId.indexOf("drive.google.com") !== -1) {
    var idMatch = folderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      folderId = idMatch[1];
    }
  }
  
  var folder;
  if (folderId !== "" && folderId.indexOf("폴더") === -1) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log("폴더 ID (" + folderId + ") 조회 실패, 내 드라이브 루트에 저장합니다: " + e.toString());
      folder = DriveApp.getRootFolder();
    }
  } else {
    folder = DriveApp.getRootFolder();
  }
  
  var filename = postTitle + ".pdf";
  var file = folder.createFile(pdfBlob.setName(filename));
  Logger.log("구글 드라이브 저장 완료: " + file.getUrl());
  
  // 4. PDF에서 텍스트 추출 (Google Docs OCR 기능을 통해 텍스트 자동 변환)
  var text = extractTextFromPdf(file.getId());
  
  // 5. Gemini API 호출
  var geminiResult = callGemini(text);
  
  // 6. QuickChart API를 통해 그래프 이미지 생성
  var chartBlob = generateChartImage(geminiResult.data);
  
  // 7. 이메일 발송 (GmailApp 사용)
  sendEmail(postTitle, geminiResult.summary, file, chartBlob);
}

// 대소문자 구분 없이 쿠키 헤더를 안정적으로 수집하는 헬퍼 함수
function getCookieHeader(response) {
  var headers = response.getAllHeaders(); // getAllHeaders로 변경하여 쿠키 유실 방지
  var cookies = "";
  for (var key in headers) {
    if (key.toLowerCase() === "set-cookie") {
      cookies = headers[key];
      break;
    }
  }
  
  var cookieHeader = "";
  if (cookies) {
    if (typeof cookies === "string") {
      cookieHeader = cookies.split(";")[0];
    } else if (Array.isArray(cookies)) {
      cookieHeader = cookies.map(function(c) { return c.split(";")[0]; }).join("; ");
    }
  }
  return cookieHeader;
}

function extractTextFromPdf(fileId) {
  var file = Drive.Files.copy({title: "temp_doc"}, fileId, {convert: true});
  var doc = DocumentApp.openById(file.id);
  var text = doc.getBody().getText();
  
  // 임시 Google Doc 삭제
  Drive.Files.remove(file.id);
  return text;
}

function callGemini(text) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;
  
  // 가독성을 극대화하기 위해 요약본을 볼드체 및 줄바꿈 처리가 포함된 HTML 형식으로 받도록 유도합니다.
  var prompt = "다음은 대한민국 산업통상자원부의 수출입 동향 PDF 텍스트입니다.\n" +
               "1. 주요 산업별(반도체, 자동차, 철강, 석유화학, 바이오헬스 등) 수출입 동향 핵심 요약을 800자 이내로 작성해줘.\n" +
               "   - 요약 결과물은 웹에서 바로 볼 수 있는 깔끔한 HTML 형식이어야 해.\n" +
               "   - 각 산업군은 <strong>[반도체]</strong>, <strong>[자동차]</strong> 와 같은 형태로 명확히 구분하고 볼드 처리해줘.\n" +
               "   - 각 산업 설명 문단 사이에는 가독성을 위해 반드시 <br><br> 태그를 넣어 빈 칸을 띄워줘.\n" +
               "2. 시각화를 위해 주요 품목별 수출 증감률(%) 데이터를 소수점 첫째자리까지 추출해줘.\n" +
               "반환 형식은 반드시 아래 JSON 구조와 정확히 일치해야 해:\n" +
               "{\"summary\": \"<p>HTML형식의_요약_내용</p>\", \"data\": {\"반도체\": 15.2, \"자동차\": -3.1, \"철강\": 2.5}}\n" +
               "데이터가 있는 주요 품목만 포함해줘.\n\n" +
               "텍스트:\n" + text;
               
  var payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var json = JSON.parse(response.getContentText());
  
  // 제미나이 응답 에러 핸들링
  if (json.error) {
    throw new Error("Gemini API Error: " + json.error.message + " (Code: " + json.error.code + ")");
  }
  if (!json.candidates || json.candidates.length === 0) {
    throw new Error("Gemini API returned no candidates. Raw response: " + response.getContentText());
  }
  
  var resultText = json.candidates[0].content.parts[0].text;
  return JSON.parse(resultText);
}

function generateChartImage(chartData) {
  var labels = Object.keys(chartData);
  var data = Object.values(chartData);
  
  // 세련된 파스텔톤 컬러 정의 (상승: 코랄 레드, 하락: 소프트 블루)
  var colors = data.map(function(val) {
    return val >= 0 ? "'rgba(255, 99, 132, 0.85)'" : "'rgba(54, 162, 235, 0.85)'";
  });
  var borderColors = data.map(function(val) {
    return val >= 0 ? "'rgba(255, 99, 132, 1)'" : "'rgba(54, 162, 235, 1)'";
  });
  
  // Chart.js v3 기반의 세련된 차트 레이아웃 구성
  var chartConfig = "{" +
    "type: 'bar'," +
    "data: {" +
      "labels: [" + labels.map(function(l) { return "'" + l + "'"; }).join(",") + "]," +
      "datasets: [{" +
        "data: [" + data.join(",") + "]," +
        "backgroundColor: [" + colors.join(",") + "]," +
        "borderColor: [" + borderColors.join(",") + "]," +
        "borderWidth: 1.5," +
        "borderRadius: 8," + // 세련된 둥근 모서리 처리
        "borderSkipped: false" +
      "}]" +
    "}," +
    "options: {" +
      "plugins: {" +
        "title: { display: true, text: '주요 품목별 수출 증감률 (%)', font: { size: 18, weight: 'bold', family: 'sans-serif' }, padding: { top: 15, bottom: 25 } }," +
        "legend: { display: false }" +
      "}," +
      "scales: {" +
        "x: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } }," +
        "y: { grid: { color: 'rgba(200, 200, 200, 0.15)' }, ticks: { font: { size: 11 } } }" +
      "}" +
    "}" +
  "}";
  
  var url = "https://quickchart.io/chart?c=" + encodeURIComponent(chartConfig) + "&w=800&h=450&version=3"; // Chart.js v3 엔진 활성화
  var response = UrlFetchApp.fetch(url);
  return response.getBlob();
}

function sendEmail(subject, summaryHtml, pdfFile, chartBlob) {
  var inlineImages = {};
  
  // 프리미엄 트렌디 HTML 이메일 레이아웃 설계 (인터/맑은고딕 폰트 적용, 카드 레이아웃, 부드러운 그림자 효과)
  var emailBodyHtml = 
    "<div style=\"font-family: 'Inter', 'Malgun Gothic', sans-serif; max-width: 650px; margin: 0 auto; padding: 25px; background-color: #f8f9fa; border-radius: 16px; border: 1px solid #e9ecef;\">" +
      "<div style=\"text-align: center; margin-bottom: 25px;\">" +
        "<span style=\"background-color: #e8f4fd; color: #1a73e8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 50px; text-transform: uppercase; letter-spacing: 1px;\">Monthly Report</span>" +
        "<h2 style=\"color: #1e293b; font-size: 22px; margin-top: 10px; margin-bottom: 5px; font-weight: 800; letter-spacing: -0.5px;\">" + subject + "</h2>" +
        "<p style=\"color: #64748b; font-size: 13px; margin: 0;\">산업통상자원부 공식 발표 기준 수출입 동향 분석</p>" +
      "</div>" +
      
      "<div style=\"background-color: #ffffff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02); border: 1px solid #f1f5f9; margin-bottom: 25px;\">" +
        "<h3 style=\"color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; font-weight: 700;\">📊 주요 산업별 수출입 동향 요약</h3>" +
        "<div style=\"color: #334155; font-size: 14px; line-height: 1.8; letter-spacing: -0.3px;\">" +
          summaryHtml + 
        "</div>" +
      "</div>";
      
  if (chartBlob) {
    emailBodyHtml += 
      "<div style=\"background-color: #ffffff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02); border: 1px solid #f1f5f9; text-align: center; margin-bottom: 25px;\">" +
        "<h3 style=\"color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 15px; border-bottom: 2px solid #10b981; padding-bottom: 8px; font-weight: 700; text-align: left;\">📈 주요 품목별 수출 증감률 시각화</h3>" +
        "<img src=\"cid:chartImage\" width=\"100%\" style=\"border-radius: 8px; max-width: 600px;\" />" +
      "</div>";
    inlineImages["chartImage"] = chartBlob;
  }
  
  emailBodyHtml += 
      "<div style=\"text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6; margin-top: 20px;\">" +
        "<p style=\"margin-bottom: 4px;\">본 메일은 구글 클라우드를 통해 정기 스케줄러로 자동 발송되었습니다.</p>" +
        "<p style=\"margin: 0;\">원본 보고서 PDF 파일은 메일에 첨부되어 있으며, 구글 드라이브 폴더에 안전하게 저장되었습니다.</p>" +
      "</div>" +
    "</div>";
  
  MailApp.sendEmail({
    to: EMAIL_RECEIVER,
    subject: "[수출입 동향] " + subject,
    htmlBody: emailBodyHtml,
    inlineImages: inlineImages,
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
  Logger.log("이메일 발송 완료!");
}
