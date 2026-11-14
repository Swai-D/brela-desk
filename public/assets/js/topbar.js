// Shared topbar - injected into every page so the markup lives in one place.
document.getElementById('page-topbar').innerHTML = `
                <div class="navbar-header">
                    <div class="d-flex">
                        <!-- LOGO -->
                        <div class="navbar-brand-box">
                            <a href="index.html" class="logo logo-dark">
                                <span class="logo-sm">
                                    <img src="assets/images/logo-sm.svg" alt="" height="30">
                                </span>
                                <span class="logo-lg">
                                    <img src="assets/images/logo-sm.svg" alt="" height="24"> <span class="logo-txt">BRELA Desk</span>
                                </span>
                            </a>

                            <a href="index.html" class="logo logo-light">
                                <span class="logo-sm">
                                    <img src="assets/images/logo-sm.svg" alt="" height="30">
                                </span>
                                <span class="logo-lg">
                                    <img src="assets/images/logo-sm.svg" alt="" height="24"> <span class="logo-txt">BRELA Desk</span>
                                </span>
                            </a>
                        </div>

                        <button type="button" class="btn btn-sm px-3 font-size-16 header-item" id="vertical-menu-btn">
                            <i class="fa fa-fw fa-bars"></i>
                        </button>

                        <!-- App Search-->
                        <form class="app-search d-none d-sm-block" id="uniSearch">
                            <div class="position-relative">
                                <input type="search" class="form-control" placeholder="Search clients, cases, documents...">
                                <button class="btn btn-primary" type="submit"><i class="bx bx-search-alt align-middle"></i></button>
                                <div class="us-box"></div>
                            </div>
                        </form>
                    </div>

<div class="d-flex align-items-center">
<a href="search.html" class="btn header-item us-mob" title="Search"><i class="bx bx-search"></i></a><a href="my-work.html" class="btn header-item position-relative" title="Needs your action"><i data-feather="bell" class="icon-lg"></i><span id="bell-count" class="badge bg-danger rounded-pill position-absolute" style="top:14px;right:6px;font-size:10px;display:none"></span></a>
<div class="dropdown d-inline-block"><button type="button" class="btn header-item bg-light-subtle border-start border-end" data-bs-toggle="dropdown"><span class="avatar-xs d-inline-flex me-1"><span class="avatar-title rounded-circle bg-white text-primary">☺</span></span><span class="d-none d-xl-inline-block ms-1 fw-medium" id="me-name"></span><i class="mdi mdi-chevron-down d-none d-xl-inline-block"></i></button>
<div class="dropdown-menu dropdown-menu-end"><span class="dropdown-item-text text-muted" id="me-role"></span><a class="dropdown-item" href="my-work.html"><i class="mdi mdi-check-circle font-size-16 align-middle me-1"></i> My Work</a><div class="dropdown-divider"></div><a class="dropdown-item" id="logout" href="#"><i class="mdi mdi-logout font-size-16 align-middle me-1"></i> Sign out</a></div></div>
</div></div>
            `;
