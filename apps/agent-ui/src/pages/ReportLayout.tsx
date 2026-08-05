import { css } from "@emotion/css";
import {
  Brand,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  Nav,
  NavGroup,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";
import type React from "react";
import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import RedHatOpenShiftLogo from "../assets/RedHatOpenShiftLogo.png";
import { useAgentStatus } from "../common/AgentStatusContext";
import VCenterCredentialsDropdownMenu from "../credentials/VCenterCredentialsDropdownMenu";
import { RvtoolsRefreshMenu } from "../rvtools/RvtoolsRefreshMenu";

interface ReportNavItem {
  path: string;
  label: string;
}

interface ReportNavSection {
  title: string;
  items: ReportNavItem[];
}

/**
 * Storage offload estimator and report comparison both depend on
 * vCenter/console-only backend capabilities (forecaster/VDDK, and
 * `compareCollections`/`getClusterUtilization`, respectively — all 501 in
 * RVTools mode) — drop them from the nav, and drop the "Tools" section
 * entirely if that empties it out rather than showing an empty header.
 */
function getNavSections(isRvtoolsMode: boolean): ReportNavSection[] {
  const sections: ReportNavSection[] = [
    {
      title: "Reporting",
      items: [
        { path: "/report/vms-overview", label: "Virtual machines overview" },
        { path: "/report/groups", label: "Groups" },
      ],
    },
    {
      title: "Tools",
      items: isRvtoolsMode
        ? []
        : [
            {
              path: "/report/storage-offload-estimator",
              label: "Storage offload estimator",
            },
            { path: "/report/report-comparison", label: "Report comparison" },
          ],
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

const appTitleStyle = css`
  padding: var(--pf-t--global--spacer--md);
  margin-bottom: var(--pf-t--global--spacer--sm);
`;

const navGroupStyle = css`
  .pf-v6-c-nav__section-title {
    font-weight: var(--pf-t--global--font--weight--body--bold);
    color: var(--pf-t--global--text--color--regular);
    font-size: var(--pf-t--global--font--size--body--default);
    padding-inline: var(--pf-t--global--spacer--md);
  }
`;

const navItemStyle = css`
  .pf-v6-c-nav__link {
    color: var(--pf-t--global--text--color--subtle);
    border-radius: var(--pf-t--global--border--radius--medium);
    margin-inline: var(--pf-t--global--spacer--sm);
  }

  &.report-nav-item-active .pf-v6-c-nav__link {
    background-color: var(--pf-t--global--background--color--primary--default);
    color: var(--pf-t--global--text--color--regular);
    font-weight: var(--pf-t--global--font--weight--body--default);
  }
`;

export const ReportLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isRvtoolsMode, refetch: refetchAgentStatus } = useAgentStatus();

  const navSections = useMemo(
    () => getNavSections(isRvtoolsMode),
    [isRvtoolsMode],
  );

  const activeItem = useMemo(
    () =>
      navSections
        .flatMap((section) => section.items)
        .find((item) => location.pathname.startsWith(item.path)),
    [location.pathname, navSections],
  );

  useEffect(() => {
    document.title = activeItem
      ? `${activeItem.label} | Migration Advisor`
      : "Migration Advisor";
  }, [activeItem]);

  return (
    <Page
      isManagedSidebar
      masthead={
        <Masthead>
          <MastheadMain>
            <MastheadToggle>
              <PageToggleButton
                isHamburgerButton
                aria-label="Global navigation"
              />
            </MastheadToggle>
            <MastheadBrand>
              <MastheadLogo>
                <Brand
                  src={RedHatOpenShiftLogo}
                  alt="Red Hat OpenShift Logo"
                  heights={{ default: "36px" }}
                />
              </MastheadLogo>
            </MastheadBrand>
          </MastheadMain>
          <MastheadContent>
            <Toolbar isFullHeight>
              <ToolbarContent>
                <ToolbarGroup align={{ default: "alignEnd" }}>
                  <ToolbarItem>
                    {isRvtoolsMode ? (
                      <RvtoolsRefreshMenu
                        refetchAgentStatus={refetchAgentStatus}
                      />
                    ) : (
                      <VCenterCredentialsDropdownMenu />
                    )}
                  </ToolbarItem>
                </ToolbarGroup>
              </ToolbarContent>
            </Toolbar>
          </MastheadContent>
        </Masthead>
      }
      sidebar={
        <PageSidebar>
          <PageSidebarBody>
            <Title headingLevel="h1" size="lg" className={appTitleStyle}>
              Migration Advisor
            </Title>
            <Nav aria-label="Main navigation">
              <NavList>
                {navSections.map((section) => (
                  <NavGroup
                    key={section.title}
                    title={section.title}
                    className={navGroupStyle}
                  >
                    {section.items.map((item) => {
                      const isActive = activeItem?.path === item.path;
                      return (
                        <NavItem
                          key={item.path}
                          isActive={isActive}
                          className={`${navItemStyle}${isActive ? " report-nav-item-active" : ""}`}
                          onClick={() => navigate(item.path)}
                        >
                          {item.label}
                        </NavItem>
                      );
                    })}
                  </NavGroup>
                ))}
              </NavList>
            </Nav>
          </PageSidebarBody>
        </PageSidebar>
      }
    >
      <Outlet />
    </Page>
  );
};

ReportLayout.displayName = "ReportLayout";
