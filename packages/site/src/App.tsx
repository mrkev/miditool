import { useState } from "react";
import GitHubButton from "react-github-btn";
import { add } from "../../NEW_LIB/src";
import "./App.css";

const FOLDER_STRUCTURE = `
docs/             built website, configure GH Pages to point here
packages/
  NEW_LIB/        source for the library
  site/           source code for the site
`.trim();

export function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>
        Simple
        <br />
        Vite + React + TypeScript
        <br />
        Monorepo Library Template
      </h1>

      <p>
        <a href="https://github.com/mrkev/new-react-ts-monorepo-lib">
          github.com/mrkev/new-react-ts-monorepo-lib
        </a>
      </p>

      <GitHubButton
        href="https://github.com/mrkev/new-react-ts-monorepo-lib"
        data-color-scheme="no-preference: light; light: light; dark: dark;"
        data-icon="octicon-star"
        data-size="large"
        aria-label="Star mrkev/new-react-ts-monorepo-lib on GitHub"
      >
        Star
      </GitHubButton>
      <GitHubButton
        href="https://github.com/mrkev/new-react-ts-monorepo-lib/generate"
        data-color-scheme="no-preference: light; light: light; dark: dark;"
        data-icon="octicon-repo-template"
        data-size="large"
        aria-label="Use this template mrkev/new-react-ts-monorepo-lib on GitHub"
      >
        Use this template
      </GitHubButton>

      {/* Instructions */}
      <h2 className="left">Getting Started</h2>
      <ol style={{ textAlign: "left" }}>
        <li>
          Click <code>"Use Template"</code> above
        </li>
        <li>Clone the repo you created</li>
        <li>Use these scripts:</li>
        {/* Scripts */}
        <ul style={{ textAlign: "left" }}>
          <li>
            <code>build</code> builds this website and the library ready for
            publishing
          </li>
          <li>
            <code>build:site</code> builds only the website
          </li>
          <li>
            <code>build:lib</code> builds only the library
          </li>
          <li>
            <code>dev</code> starts the dev server
          </li>
        </ul>
        <li>Edit away! Folder structure:</li>
        <pre
          style={{
            textAlign: "left",
            background: "black",
            color: "white",
            padding: "2px 3px 1px 3px",
          }}
        >
          {FOLDER_STRUCTURE}
        </pre>
      </ol>
      <hr></hr>

      <p className="left">
        This sample library just adds two numbers.
        <br />
        The latest version is always built with the site:
      </p>
      <button onClick={() => setCount((count) => add(count, 1))}>
        add one: {count}
      </button>
      <p></p>

      <hr></hr>

      <p
        className="read-the-docs"
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "5px",
          justifyContent: "center",
        }}
      >
        <a href="https://aykev.dev/">Kevin Chavez</a> ·
        <a href="https://twitter.com/aykev">@aykev</a> ·
        <GitHubButton
          href="https://github.com/mrkev"
          data-color-scheme="no-preference: light; light: light; dark: dark;"
          data-size="large"
          data-show-count="true"
          aria-label="Follow @mrkev on GitHub"
        >
          Follow @mrkev
        </GitHubButton>
      </p>
    </>
  );
}
