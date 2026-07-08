// Google Apps Script - 100% Cloud MOTIE Report Automation
// 이 스크립트를 사용하면 깃허브 액션 없이 구글 클라우드에서 100% 무료 및 자동으로 동작합니다.

const GEMINI_API_KEY = "여기에_제미나이_API_키_입력";
const EMAIL_RECEIVER = "받을_이메일_주소@gmail.com";
const GOOGLE_DRIVE_FOLDER_ID = ""; // 옵션: 구글 드라이브 특정 폴더 ID (비워두면 내 드라이브 루트에 저장)

function runMonthlyReport() {
  var now = new Date();
  // 매월 1일에 전월 데이터 발표 (예: 7월 1일 -> 6월 수출입 동향)
  var targetMonth = now.getMonth(); // getMonth()는 0-11 이므로 7월에 실행하면 6이 나옴 (즉, 6월)
  var targetYear = now.getFullYear();
  if (targetMonth === 0) {
    targetMonth = 12;
    targetYear -= 1;
  }
  
  Logger.log("대상: " + targetYear + "년 " + targetMonth + "월 수출입 동향");
  
  // 1. 게시판 검색
  var baseUrl = "https://www.motie.go.kr";
  var searchUrl = baseUrl + "/kor/article/ATCL3f49a5a8c?searchCondition=1&searchKeyword=" + encodeURIComponent("수출입 동향");
  
  var response = UrlFetchApp.fetch(searchUrl, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  
  var html = response.getContentText("UTF-8");
  
  // HTML 파싱 (Regex 사용)
  var trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  var match;
  var targetRowHtml = null;
  var postTitle = null;
  
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
          break;
        }
      }
    }
  }
  
  if (!targetRowHtml) {
    Logger.log("이번 달 게시물을 찾지 못했습니다.");
    return;
  }
  
  Logger.log("게시물 발견: " + postTitle);
  
  // 첨부파일 링크 추출
  var attachPattern = /\/attach\/down\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+/g;
  var attachMatches = targetRowHtml.match(attachPattern);
  if (!attachMatches) {
    Logger.log("첨부파일 링크를 찾지 못했습니다.");
    return;
  }
  
  var fileUrl = baseUrl + attachMatches[0];
  Logger.log("PDF 다운로드 시작: " + fileUrl);
  
  // 세션 쿠키 유지를 위해 첫 검색 시 받은 쿠키 헤더 파싱
  var cookies = response.getHeaders()["Set-Cookie"] || response.getHeaders()["set-cookie"] || "";
  var cookieHeader = "";
  if (cookies) {
    if (typeof cookies === "string") {
      cookieHeader = cookies.split(";")[0];
    } else if (Array.isArray(cookies)) {
      cookieHeader = cookies.map(function(c) { return c.split(";")[0]; }).join("; ");
    }
  }
  
  // PDF 다운로드
  var pdfResponse = UrlFetchApp.fetch(fileUrl, {
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookieHeader,
      "Referer": searchUrl
    }
  });
  
  var pdfBlob = pdfResponse.getBlob();
  var content = pdfBlob.getBytes();
  
  // PDF 확인 (%PDF로 시작하는지)
  var isPdf = (content[0] === 0x25 && content[1] === 0x50 && content[2] === 0x44 && content[3] === 0x46); // %PDF
  if (!isPdf) {
    Logger.log("다운로드된 파일이 PDF 형식이 아닙니다.");
    return;
  }
  
  // 2. 구글 드라이브에 PDF 저장
  var folder = GOOGLE_DRIVE_FOLDER_ID ? DriveApp.getFolderById(GOOGLE_DRIVE_FOLDER_ID) : DriveApp.getRootFolder();
  var filename = postTitle + ".pdf";
  var file = folder.createFile(pdfBlob.setName(filename));
  Logger.log("구글 드라이브 저장 완료: " + file.getUrl());
  
  // 3. PDF에서 텍스트 추출 (Google Docs OCR 기능을 통해 텍스트 자동 변환)
  var text = extractTextFromPdf(file.getId());
  
  // 4. Gemini API 호출
  var geminiResult = callGemini(text);
  
  // 5. QuickChart API를 통해 그래프 이미지 생성
  var chartBlob = generateChartImage(geminiResult.data);
  
  // 6. 이메일 발송 (GmailApp 사용)
  sendEmail(postTitle, geminiResult.summary, file, chartBlob);
}

function extractTextFromPdf(fileId) {
  // Advanced Drive Service가 활성화되어 있어야 동작합니다. (방법은 가이드 참조)
  var file = Drive.Files.copy({title: "temp_doc"}, fileId, {convert: true});
  var doc = DocumentApp.openById(file.id);
  var text = doc.getBody().getText();
  
  // 임시 Google Doc 삭제
  Drive.Files.remove(file.id);
  return text;
}

function callGemini(text) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY;
  
  var prompt = "다음은 산업통상자원부의 수출입 동향 PDF 텍스트입니다.\n" +
               "1. 주요 산업별(반도체, 자동차, 철강, 석유화학, 바이오헬스 등) 수출입 동향을 600자 이내로 핵심만 요약해줘.\n" +
               "2. 시각화를 위해 주요 품목별 수출 증감률(%) 데이터를 추출해줘.\n" +
               "반환 형식은 반드시 아래 JSON 구조와 정확히 일치해야 해:\n" +
               "{\"summary\": \"요약 내용\", \"data\": {\"반도체\": 15.2, \"자동차\": -3.1, \"철강\": 2.5}}\n" +
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
  var resultText = json.candidates[0].content.parts[0].text;
  return JSON.parse(resultText);
}

function generateChartImage(chartData) {
  var labels = Object.keys(chartData);
  var data = Object.values(chartData);
  
  var colors = data.map(function(val) {
    return val >= 0 ? "'#ff6b6b'" : "'#4dabf7'";
  });
  
  // QuickChart.io API 파라미터 정의 (차트 생성 서비스)
  var chartConfig = "{" +
    "type: 'bar'," +
    "data: {" +
      "labels: [" + labels.map(function(l) { return "'" + l + "'"; }).join(",") + "]," +
      "datasets: [{" +
        "label: '증감률 (%)'," +
        "data: [" + data.join(",") + "]," +
        "backgroundColor: [" + colors.join(",") + "]" +
      "}]" +
    "}," +
    "options: {" +
      "title: { display: true, text: '주요 품목별 수출 증감률 (%)', fontSize: 16 }," +
      "legend: { display: false }" +
    "}" +
  "}";
  
  var url = "https://quickchart.io/chart?c=" + encodeURIComponent(chartConfig) + "&w=600&h=400";
  var response = UrlFetchApp.fetch(url);
  return response.getBlob();
}

function sendEmail(subject, summary, pdfFile, chartBlob) {
  var inlineImages = {};
  var htmlBody = "<p>" + summary.replace(/\n/g, "<br>") + "</p><br>";
  
  if (chartBlob) {
    htmlBody += "<img src='cid:chartImage' width='600'/><br><br>";
    inlineImages["chartImage"] = chartBlob;
  }
  
  htmlBody += "<p>※ 원본 PDF 파일은 구글 드라이브에 저장되었으며 메일에 첨부해 드립니다.</p>";
  
  MailApp.sendEmail({
    to: EMAIL_RECEIVER,
    subject: "[수출입 동향] " + subject,
    htmlBody: htmlBody,
    inlineImages: inlineImages,
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
  Logger.log("이메일 발송 완료!");
}
