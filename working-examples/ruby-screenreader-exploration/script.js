function loadData() {
  fetch('tests.json')
    .then(response => response.json())
    .then(data => {
    data.cases.forEach(caseData => {
      const article = document.getElementById(caseData.id);
      if (!article) return;
      article.innerHTML = '';
      const header = document.createElement('header');
      const h1 = document.createElement('h1');
      h1.textContent = 'Case ' + caseData.id.split('-')[0] + ': ' + caseData.name;
      header.appendChild(h1);
      article.appendChild(header);
      const h2Purpose = document.createElement('h2');
      h2Purpose.textContent = 'Purpose for Case';
      article.appendChild(h2Purpose);
      const pPurpose = document.createElement('p');
      pPurpose.textContent = caseData.description;
      article.appendChild(pPurpose);
      caseData.examples.forEach(example => {
        const h2Example = document.createElement('h2');
        h2Example.textContent = 'Example ' + example.id + ': ' + example.name;
        article.appendChild(h2Example);
        const pExample = document.createElement('p');
        pExample.innerHTML = example.html;
        article.appendChild(pExample);
      });
      const footer = document.createElement('footer');
      const h2Results = document.createElement('h2');
      h2Results.textContent = 'Screenreader Testing Results';
      footer.appendChild(h2Results);
      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr>
            <th>Test ID</th>
            <th>Test Name</th>
            <th>Test Description</th>
            <th>Test Steps</th>
            <th>Expected Outcome</th>
            <th>Actual Outcome</th>
            <th>Failure Reason</th>
            <th>Suspected Culprit (Author, HTML, AccTree/Browser, AT)</th>
            <th>Confirmed?</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      footer.appendChild(table);
      article.appendChild(footer);
      const tbody = table.querySelector('tbody');
      caseData.examples.forEach(example => {
        example.tests.forEach(test => {
          const testId = caseData.id + '-' + example.id + '-' + test.id;
          const testName = caseData.name + ' - ' + example.name + ' - ' + test.platform;
          const testDescription = test.platform;
          const testSteps = [
            '1. Load the page with the ruby example',
            '2. Enable ' + test.platform.split(' + ')[1] + ' screenreader',
            '3. Navigate to the ruby text',
            '4. Verify the announcement of the ruby annotation'
          ];
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <th>${testId}</th>
            <td>${testName}</td>
            <td>${testDescription}</td>
            <td>${testSteps.join(', ')}</td>
            <td>${test.expected_outcome}</td>
            <td>${test.actual_outcome}</td>
            <td>${test.failure_reason}</td>
            <td>${test.suspected_culprit}</td>
            <td>${test.confirmed ? 'Yes' : 'No'}</td>
          `;
          tbody.appendChild(tr);
        });
      });
    });
  })
  .catch(error => console.error('Error loading data:', error));
}

window.addEventListener('DOMContentLoaded', loadData);