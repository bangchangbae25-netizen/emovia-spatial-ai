const cases = {
  residential: { eyebrow: "LIVING EXPERIENCE", title: "가족의 하루가 편안해지는 공간", description: "가족 구성과 생활 습관을 먼저 살펴보고, 이동·수납·빛·색의 관계를 함께 조정합니다.", before: "공간은 넓지만 생활 동선이 겹치고, 수납과 조명이 따로 작동합니다.", after: "자주 하는 행동을 중심으로 동선이 단순해지고, 필요한 곳에 빛과 수납이 연결됩니다.", tags: ["생활 동선", "수납", "컬러", "조명"] },
  commercial: { eyebrow: "BRAND EXPERIENCE", title: "머무르고 기억되는 브랜드 공간", description: "입구에서 첫인상, 이동, 체류, 구매까지 고객 경험의 흐름을 공간에 연결합니다.", before: "눈에 띄는 요소는 많지만 어디를 먼저 보고 움직여야 할지 모호합니다.", after: "시선의 중심이 선명해지고 브랜드 경험이 자연스럽게 체류와 행동으로 이어집니다.", tags: ["시선 흐름", "브랜드", "체류", "행동"] },
  public: { eyebrow: "INCLUSIVE EXPERIENCE", title: "누구나 쉽게 이해하고 이용하는 공간", description: "연령과 신체 조건이 다른 사용자도 안전하게 찾고, 이동하고, 배우도록 돕습니다.", before: "안내와 공간 구성이 분리되어 처음 온 사람에게 이용 순서가 어렵습니다.", after: "정보의 우선순위와 길찾기가 공간 흐름에 맞춰져 누구나 편하게 이용합니다.", tags: ["접근성", "안전", "길찾기", "학습 흐름"] }
};

function showCase(id) {
  const item = cases[id];
  document.querySelector("#case-eyebrow").textContent = item.eyebrow;
  document.querySelector("#case-title").textContent = item.title;
  document.querySelector("#case-description").textContent = item.description;
  document.querySelector("#case-before").textContent = item.before;
  document.querySelector("#case-after").textContent = item.after;
  document.querySelector("#case-tags").innerHTML = item.tags.map(tag => `<span>${tag}</span>`).join("");
  const display = document.querySelector(".case-display");
  display.style.animation = "none";
  requestAnimationFrame(() => { display.style.animation = "reveal .38s ease"; });
}

document.querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-case]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
  showCase(button.dataset.case);
}));

showCase("residential");
