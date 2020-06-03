import React from "react";
import { useStaticQuery, graphql } from "gatsby";
import RepoCard from "./repoCard";
import useThemeContext from "../hooks/themeContext";

function Projects() {
  const { style } = useThemeContext();
  const {
    github: {
      viewer: { pinnedItems: repositories }
    }
  } = useStaticQuery(
    graphql`
      query {
        github {
          viewer {
            pinnedItems(first: 6, types: REPOSITORY) {
              nodes {
                ... on GitHub_Repository {
                  owner {
                    login
                  }
                  name
                  url
                  description
                  isPrivate
                  stargazers {
                    totalCount
                  }
                  forkCount
                }
              }
            }
          }
        }
      }
    `
  );
  return (
    <>
      <h2 className={style === "dark" ? "text-white" : ""}>My Projects</h2>
      <p className={`f4 mb-4 ${style === "dark" ? "text-white" : "text-gray"}`}>
        GitHub repositories that I've built.
      </p>
      <div className="d-sm-flex flex-wrap gutter-condensed mb-4">
        {repositories.nodes.map((repository, i) => {
          if (repository.isPrivate) {
            return null;
          }
          return (
            <div key={i} className="col-sm-6 col-md-12 col-lg-6 col-xl-4 mb-3">
              <RepoCard repository={repository} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export default Projects;
