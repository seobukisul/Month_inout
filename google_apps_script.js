// Google Apps Script - 100% Cloud MOTIE Report Automation
// 이 스크립트를 사용하면 깃허브 액션 없이 구글 클라우드에서 100% 무료 및 자동으로 동작합니다.

const GEMINI_API_KEY = "여기에_제미나이_API_키_입력";

// 1. 수신 이메일 주소 설정 (여러 명에게 공유 시 콤마(,)로 구분하여 입력 가능)
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
  
  // 6. QuickChart API를 통해 그래프 이미지 2종 생성 (수출 증감률 막대그래프 + 추천 포트폴리오 도넛차트)
  var barChartBlob = generateBarChartImage(geminiResult.data);
  var pieChartBlob = generatePieChartImage(geminiResult.portfolio);
  
  // 7. 이메일 발송 (GmailApp 사용)
  sendEmail(postTitle, geminiResult.summary, file, barChartBlob, pieChartBlob);
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
  
  // 기관급 투자 레포트 구성을 위해 세분화된 요구사항 정의
  var prompt = "당신은 글로벌 최상위 투자은행(IB)의 '수석 주식 애널리스트 및 포트폴리오 전략가(Chief Equity Strategist)'입니다.\n" +
               "산업통상자원부 수출입 동향 텍스트 데이터를 분석하여 실제 자산 운용사 펀드매니저들이 의사결정에 참고할 수준의 '월간 산업 투자 포트폴리오 리포트'를 작성해 주세요.\n\n" +
               "보고서는 반드시 아래 8가지 뼈대를 기반으로 풍부하고 디테일하게 한글 HTML 형식으로 작성해 주어야 합니다:\n\n" +
               "1. **Executive Summary (투자 신호 요약)**\n" +
               "   - 산업별 매력도를 [★★★★★ 매우 긍정], [★★★★ 긍정], [★★★ 중립], [★★ 부정], [★ 매우 부정] 등급으로 분류하고 매력도별 해당 품목을 명시.\n" +
               "2. **산업별 Momentum 추세 분석 표 (HTML Table)**\n" +
               "   - 주요 품목들(반도체, 자동차, 바이오헬스, 디스플레이, 디스플레이, 철강 등)의 이번 달 수출액, YoY 증감률, 추세 판단(예: 강한 상승, 회복세, 약세 지속 등)을 깔끔한 테두리가 있는 표(HTML Table)로 구현.\n" +
               "3. **핵심 산업별 투자 포인트 & 모멘텀 심층 분석**\n" +
               "   - 긍정/매우 긍정 산업의 성장 동력(단가 추이, 해외 가동률 등 구체적 지표 활용), 부정/매우 부정 산업의 부진 배경(공급 과잉, 단가 하락 등)을 조밀하게 분석.\n" +
               "4. **산업별 대표 기업 탑 5 주식 종목 명시**\n" +
               "   - 분석한 각 주요 산업마다 해당 업종의 수혜를 입는 국내 핵심 상장 주식(KOSPI/KOSDAQ) **탑 5 기업**을 반드시 매칭해 나열. (예: 반도체 -> 삼성전자, SK하이닉스, 한미반도체, 리노공업, HPSP 등)\n" +
               "5. **실제 포트폴리오 추천 비중 (HTML Table)**\n" +
               "   - 이번 지표를 반영한 추천 투자 포트폴리오 자산 배분 비중(%) 테이블 구현. (예: 반도체 35%, 바이오 15%, 현금 10% 등)\n" +
               "6. **글로벌 리스크 요인**\n" +
               "   - 관세 정책, 대외 전쟁, 공급망 차질 등 주의 깊게 관찰해야 할 주요 대외 변수 기술.\n\n" +
               "**가독성 디자인 가이드라인**:\n" +
               "   - 각 1~6 항목의 큰 제목은 <strong>[항목명]</strong> 형태로 강조하고, 항목 사이 및 설명 문단 사이에는 반드시 문단 구분용 줄바꿈(<br><br>)을 넣어 시각적인 여백을 확보해 주세요.\n" +
               "   - 깔끔한 불릿포인트(•)와 적절한 텍스트 하이라이트를 주어 가독성을 최대로 높여주세요.\n\n" +
               "**시각화 데이터 수집**:\n" +
               "   - `data`: 주요 5~6개 핵심 품목의 수출 증가율(%) 데이터를 추출 (막대그래프용)\n" +
               "   - `portfolio`: 위에서 제안한 추천 포트폴리오 비중(%) 데이터를 추출 (원형 차트용)\n\n" +
               "반환 형식은 반드시 아래 JSON 구조와 정확히 일치해야 합니다 (코드 블럭 기호 없이 순수 JSON만 반환):\n" +
               "{\"summary\": \"HTML형식의_상세_기관급_투자_보고서_내용\", \"data\": {\"반도체\": 15.2, \"자동차\": -3.1, \"철강\": 2.5}, \"portfolio\": {\"반도체\": 35, \"바이오\": 15, \"화장품\": 10, \"선박\": 10, \"가전\": 5, \"현금\": 25}}\n\n" +
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
  var jsonText = response.getContentText();
  
  // 마크다운 JSON 감쌈 코드 블럭이 있을 경우 클리닝 처리
  jsonText = jsonText.replace(/^```json/i, "").replace(/```$/, "").trim();
  
  var json = JSON.parse(jsonText);
  
  // 에러 핸들링
  if (json.error) {
    throw new Error("Gemini API Error: " + json.error.message + " (Code: " + json.error.code + ")");
  }
  
  return json;
}

function generateBarChartImage(chartData) {
  var labels = Object.keys(chartData);
  var data = Object.values(chartData);
  
  var colors = data.map(function(val) {
    return val >= 0 ? "rgba(255, 99, 132, 0.85)" : "rgba(54, 162, 235, 0.85)";
  });
  var borderColors = data.map(function(val) {
    return val >= 0 ? "rgba(255, 99, 132, 1)" : "rgba(54, 162, 235, 1)";
  });
  
  var chartObject = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      plugins: {
        title: { 
          display: true, 
          text: '주요 품목별 수출 증감률 (%)', 
          font: { size: 18, weight: 'bold', family: 'sans-serif' }, 
          padding: { top: 15, bottom: 25 } 
        },
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } },
        y: { grid: { color: 'rgba(200, 200, 200, 0.15)' }, ticks: { font: { size: 11 } } }
      }
    }
  };
  
  var url = "https://quickchart.io/chart";
  var payload = {
    chart: JSON.stringify(chartObject),
    width: 800,
    height: 450,
    version: "3"
  };
  
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  return response.getBlob();
}

function generatePieChartImage(portfolioData) {
  var labels = Object.keys(portfolioData);
  var data = Object.values(portfolioData);
  
  // 고급스러운 포트폴리오 추천 도넛 차트 컬러 구성
  var colors = [
    "rgba(75, 192, 192, 0.85)",   // Teal
    "rgba(153, 102, 255, 0.85)",  // Purple
    "rgba(255, 159, 64, 0.85)",   // Orange
    "rgba(255, 205, 86, 0.85)",   // Yellow
    "rgba(201, 203, 207, 0.85)",  // Grey
    "rgba(54, 162, 235, 0.85)"    // Blue
  ];
  
  var chartObject = {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      plugins: {
        title: { 
          display: true, 
          text: '추천 자산배분 포트폴리오 비중 (%)', 
          font: { size: 18, weight: 'bold', family: 'sans-serif' }, 
          padding: { top: 15, bottom: 25 } 
        },
        legend: {
          position: 'right',
          labels: {
            font: { size: 12, weight: 'bold' }
          }
        }
      }
    }
  };
  
  var url = "https://quickchart.io/chart";
  var payload = {
    chart: JSON.stringify(chartObject),
    width: 800,
    height: 450,
    version: "3"
  };
  
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  return response.getBlob();
}

function sendEmail(subject, summaryHtml, pdfFile, barChartBlob, pieChartBlob) {
  var inlineImages = {};
  
  // 프리미엄 트렌디 HTML 이메일 레이아웃 설계 (카드 형태, 연여백 확보, 차트 2종 좌우/상하 배치)
  var emailBodyHtml = 
    "<div style=\"font-family: 'Inter', 'Malgun Gothic', sans-serif; max-width: 700px; margin: 0 auto; padding: 25px; background-color: #f8f9fa; border-radius: 16px; border: 1px solid #e9ecef;\">" +
      "<div style=\"text-align: center; margin-bottom: 25px;\">" +
        "<span style=\"background-color: #e2f0fd; color: #1a73e8; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 50px; text-transform: uppercase; letter-spacing: 1.5px;\">Institutional Investment Briefing</span>" +
        "<h2 style=\"color: #0f172a; font-size: 24px; margin-top: 10px; margin-bottom: 5px; font-weight: 900; letter-spacing: -0.5px;\">" + subject + "</h2>" +
        "<p style=\"color: #64748b; font-size: 13px; margin: 0;\">산업통상자원부 지표 연계 기관 분석 및 주식 매칭 리포트</p>" +
      "</div>" +
      
      "<div style=\"background-color: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02); border: 1px solid #f1f5f9; margin-bottom: 25px;\">" +
        "<div style=\"color: #334155; font-size: 14px; line-height: 1.85; letter-spacing: -0.3px;\">" +
          summaryHtml + 
        "</div>" +
      "</div>";
      
  if (barChartBlob && pieChartBlob) {
    emailBodyHtml += 
      "<div style=\"background-color: #ffffff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -1px rgba(0, 0, 0, 0.02); border: 1px solid #f1f5f9; text-align: center; margin-bottom: 25px;\">" +
        "<h3 style=\"color: #0f172a; font-size: 15px; margin-top: 0; margin-bottom: 20px; border-bottom: 2px solid #10b981; padding-bottom: 8px; font-weight: 700; text-align: left;\">📈 주요 지표 시각화 (수출입 성장성 및 포트폴리오 배분)</h3>" +
        "<img src=\"cid:barChart\" width=\"100%\" style=\"border-radius: 8px; max-width: 600px; margin-bottom: 25px;\" /><br>" +
        "<img src=\"cid:pieChart\" width=\"100%\" style=\"border-radius: 8px; max-width: 600px;\" />" +
      "</div>";
    inlineImages["barChart"] = barChartBlob;
    inlineImages["pieChart"] = pieChartBlob;
  }
  
  emailBodyHtml += 
      "<div style=\"text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6; margin-top: 20px;\">" +
        "<p style=\"margin-bottom: 4px;\">본 메일은 구글 클라우드를 통해 정기 스케줄러로 자동 발송되었습니다.</p>" +
        "<p style=\"margin: 0;\">원본 보고서 PDF 파일은 메일에 첨부되어 있으며, 구글 드라이브 폴더에 안전하게 저장되었습니다.</p>" +
      "</div>" +
    "</div>";
  
  MailApp.sendEmail({
    to: EMAIL_RECEIVER,
    subject: "[기관급 투자 보고서] " + subject,
    htmlBody: emailBodyHtml,
    inlineImages: inlineImages,
    attachments: [pdfFile.getAs(MimeType.PDF)]
  });
  Logger.log("이메일 발송 완료!");
}
