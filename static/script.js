let currentThreadId = localStorage.getItem("travel_thread_id") || null;
let latestAnswerMarkdown = "";
let waitingForApproval = false;

const AGENT_LABELS = {
  flight_agent: "✈️ Vols",
  hotel_agent: "🏨 Hôtels",
  weather_agent: "🌦️ Météo",
  budget_agent: "💰 Budget",
  itinerary_agent: "🗓️ Itinéraire / Visites",
  analyse: "🟣 Analyse",
  synthese: "🌐 Synthèse"
};

function setPrompt(text) {
  const input = document.getElementById("userInput");
  if (input) {
    input.value = text;
    input.focus();
    updateCharCounter();
  }
}

function updateCharCounter() {
  const input = document.getElementById("userInput");
  const counter = document.getElementById("charCounter");
  if (input && counter) {
    counter.textContent = `${input.value.length} / 1000`;
  }
}

function setLoading(isLoading, mode = "draft") {
  const sendBtn = document.getElementById("sendBtn");
  const btnText = document.getElementById("btnText");
  const btnLoader = document.getElementById("btnLoader");
  const approveBtn = document.getElementById("approveBtn");
  const reviseBtn = document.getElementById("reviseBtn");

  if (sendBtn) sendBtn.disabled = isLoading;
  if (approveBtn) approveBtn.disabled = isLoading;
  if (reviseBtn) reviseBtn.disabled = isLoading;

  if (isLoading && mode === "draft") {
    if (btnText) btnText.classList.add("hidden");
    if (btnLoader) btnLoader.classList.remove("hidden");
  } else {
    if (btnText) btnText.classList.remove("hidden");
    if (btnLoader) btnLoader.classList.add("hidden");
  }
}

function showError(message) {
  const errorBox = document.getElementById("errorBox");
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function hideError() {
  const errorBox = document.getElementById("errorBox");
  if (errorBox) {
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
  }
}

function renderMarkdown(element, markdown) {
  if (typeof marked !== "undefined") {
    element.innerHTML = marked.parse(markdown || "");
  } else {
    element.innerText = markdown || "";
  }
}

function showWorkflow(data) {
  const reasoning = document.getElementById("supervisorReasoning");
  const guardrailBadge = document.getElementById("guardrailBadge");

  if (reasoning) {
    reasoning.textContent = data.supervisor_reasoning || "L'agent superviseur a analysé votre demande et coordonné les agents.";
  }

  // Highlight active agent pills in structured dashboard
  const selectedAgents = data.selected_agents || [];
  const pills = document.querySelectorAll(".agent-tag");
  pills.forEach((pill) => {
    const agentKey = pill.getAttribute("data-agent");
    if (
      selectedAgents.includes(agentKey) ||
      (agentKey === "analyse" && selectedAgents.length > 0) ||
      (agentKey === "synthese" && selectedAgents.length > 0)
    ) {
      pill.classList.add("active-pill");
    } else {
      pill.classList.remove("active-pill");
    }
  });

  if (guardrailBadge) {
    if (data.guardrail_allowed === false) {
      guardrailBadge.innerHTML = '<i class="fa-solid fa-xmark"></i> Garde-fou bloqué';
      guardrailBadge.classList.add("blocked");
    } else {
      guardrailBadge.innerHTML = '<i class="fa-solid fa-check"></i> Garde-fou validé';
      guardrailBadge.classList.remove("blocked");
    }
  }
}

function showResult(answer, threadId, isDraft = false) {
  latestAnswerMarkdown = answer || "";

  const resultBox = document.getElementById("resultBox");
  const resultPlaceholder = document.getElementById("resultPlaceholder");
  const threadInfo = document.getElementById("threadInfo");
  const resultTitle = document.getElementById("resultTitle");

  if (resultPlaceholder) {
    resultPlaceholder.classList.add("hidden");
  }

  if (resultBox) {
    resultBox.classList.remove("hidden");
    renderMarkdown(resultBox, latestAnswerMarkdown);
  }

  if (threadInfo) {
    threadInfo.textContent = `Thread ID : ${threadId}`;
    threadInfo.classList.remove("hidden");
  }

  if (resultTitle) {
    resultTitle.textContent = isDraft ? "Brouillon du plan de voyage" : "Votre plan de voyage final";
  }
}

function showApproval(data) {
  waitingForApproval = true;
  const approvalRequest = document.getElementById("approvalRequest");
  if (approvalRequest) {
    approvalRequest.textContent =
      data.approval_request ||
      "Examinez l'itinéraire proposé et approuvez-le ou donnez vos commentaires avant la génération du plan final.";
  }
  const feedbackInput = document.getElementById("approvalFeedback");
  if (feedbackInput) {
    feedbackInput.focus();
  }
}

function hideApproval() {
  waitingForApproval = false;
  const feedbackInput = document.getElementById("approvalFeedback");
  if (feedbackInput) {
    feedbackInput.value = "";
  }
}

async function sendMessage() {
  hideError();

  if (waitingForApproval) {
    showError("Veuillez approuver ou réviser le brouillon en cours avant de lancer un nouveau plan.");
    return;
  }

  const input = document.getElementById("userInput");
  const message = input ? input.value.trim() : "";

  if (!message) {
    showError("Veuillez saisir votre demande de voyage dans le champ prévu.");
    return;
  }

  setLoading(true, "draft");

  try {
    const response = await fetch("/api/travel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        thread_id: currentThreadId
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Une erreur est survenue lors de la génération.");
    }

    currentThreadId = data.thread_id;
    localStorage.setItem("travel_thread_id", currentThreadId);

    showWorkflow(data);

    if (data.requires_approval) {
      showResult(data.itinerary || data.answer, data.thread_id, true);
      showApproval(data);
    } else {
      hideApproval();
      showResult(data.answer, data.thread_id, false);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false, "draft");
  }
}

async function submitApproval(approved) {
  hideError();

  if (!currentThreadId || !waitingForApproval) {
    showError("Aucun brouillon n'est actuellement en attente d'approbation.");
    return;
  }

  const feedbackInput = document.getElementById("approvalFeedback");
  const feedback = feedbackInput ? feedbackInput.value.trim() : "";

  if (!approved && !feedback) {
    showError("Veuillez spécifier vos commentaires de révision.");
    if (feedbackInput) feedbackInput.focus();
    return;
  }

  setLoading(true, "approval");

  try {
    const response = await fetch("/api/travel/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        thread_id: currentThreadId,
        approved: approved,
        feedback: feedback
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Impossible de reprendre le flux de voyage.");
    }

    showWorkflow(data);
    hideApproval();
    showResult(data.answer, data.thread_id, false);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false, "approval");
  }
}

function copyResult() {
  const resultBox = document.getElementById("resultBox");
  const text = resultBox ? resultBox.innerText : "";

  if (!text) {
    showError("Aucun plan généré à copier.");
    return;
  }

  navigator.clipboard.writeText(text)
    .then(() => {
      const copyBtn = document.querySelector(".copy-btn span");
      if (copyBtn) {
        const oldText = copyBtn.textContent;
        copyBtn.textContent = "Copié !";
        setTimeout(() => {
          copyBtn.textContent = oldText;
        }, 1500);
      }
    })
    .catch(() => {
      showError("Impossible de copier le résultat.");
    });
}

function downloadPDF() {
  const pdfContent = document.getElementById("pdfContent");

  if (!latestAnswerMarkdown || !pdfContent) {
    showError("Aucun plan de voyage à télécharger.");
    return;
  }

  const downloadBtn = document.querySelector(".download-btn span");
  const btnEl = document.querySelector(".download-btn");
  const oldText = downloadBtn ? downloadBtn.textContent : "Télécharger PDF";

  if (downloadBtn) downloadBtn.textContent = "Génération PDF...";
  if (btnEl) btnEl.disabled = true;

  const options = {
    margin: 0.5,
    filename: "plan-voyage-tripmate.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] }
  };

  html2pdf()
    .set(options)
    .from(pdfContent)
    .save()
    .then(() => {
      if (downloadBtn) downloadBtn.textContent = oldText;
      if (btnEl) btnEl.disabled = false;
    })
    .catch(() => {
      if (downloadBtn) downloadBtn.textContent = oldText;
      if (btnEl) btnEl.disabled = false;
      showError("Échec du téléchargement du PDF.");
    });
}

// Initial setup
document.addEventListener("DOMContentLoaded", () => {
  const userInput = document.getElementById("userInput");
  if (userInput) {
    userInput.addEventListener("input", updateCharCounter);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
