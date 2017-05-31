#!/usr/bin/env bash
# $Id: 358fe1420edbdc6dfc714b73e197c3f8e00dc286 $

set -o pipefail

##
### Copyright 2011-2015, BMC Software, Inc.
###
### Licensed under the Apache License, Version 2.0 (the "License");
### you may not use this file except in compliance with the License.
### You may obtain a copy of the License at
###
###     http://www.apache.org/licenses/LICENSE-2.0
###
### Unless required by applicable law or agreed to in writing, software
### distributed under the License is distributed on an "AS IS" BASIS,
### WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
### See the License for the specific language governing permissions and
### limitations under the License.
###

PLATFORMS=("Ubuntu" "Debian" "CentOS" "Amazon" "RHEL" "SmartOS" "openSUSE" "FreeBSD" "LinuxMint" "Gentoo" "Oracle" "Scientific" "SHMZ" "OSX" "Alpine" "CloudLinux", "ArchLinux")

# Put additional version numbers here.
# These variables take the form ${platform}_VERSIONS, where $platform matches
# the tags in $PLATFORMS
Ubuntu_VERSIONS=("10.04" "10.10" "11.04" "11.10" "12.04" "12.10" "13.04" "13.10" "14.04" "14.10" "15.04" "15.10" "16.04")
Debian_VERSIONS=("5" "6" "7" "8")
CentOS_VERSIONS=("5" "6" "7")
Amazon_VERSIONS=("2012.09" "2013.03" "2016.03")
RHEL_VERSIONS=("5" "6" "7")
SmartOS_VERSIONS=("1" "12" "13")
openSUSE_VERSIONS=("12.1" "12.3" "13.1")
FreeBSD_VERSIONS=("10" "11")
LinuxMint_VERSIONS=("13", "14", "15", "16")
Gentoo_VERSIONS=("1.12.11.1")
Oracle_VERSIONS=("5" "6" "7")
Scientific_VERSIONS=("6" "7")
SHMZ_VERSIONS=("5" "6")
OSX_VERSIONS=("12.0.0" "13.0.0" "14.0.0")
Alpine_VERSIONS=("2.5" "2.7")
CloudLinux_VERSIONS=("5" "6" "7")
ArchLinux_VERSIONS=("4")

# sed strips out obvious things in a version number that can't be used as
# a bash variable
function map() { eval "$1"`echo $2 | sed 's/[\. -]//g'`='$3' ; }
function get() { eval echo '${'"$1`echo $2 | sed 's/[\. -]//g'`"'#hash}' ; }

# Map distributions to common strings.
map Ubuntu 10.04 lucid
map Ubuntu 10.10 maverick
map Ubuntu 11.04 natty
map Ubuntu 11.10 oneiric
map Ubuntu 12.04 precise
map Ubuntu 12.10 quantal
map Ubuntu 13.04 raring
map Ubuntu 13.10 saucy
map Ubuntu 14.04 trusty
map Ubuntu 14.10 utopic
map Ubuntu 15.04 vivid
map Ubuntu 15.10 wily
map Ubuntu 16.04 xenial
map Debian 5 lenny
map Debian 6 squeeze
map Debian 7 wheezy
map Debian 8 jessie
map RHEL 5 Tikanga
map RHEL 6 Santiago
map RHEL 7 Maipo

# For version number updates you hopefully don't need to modify below this line
# -----------------------------------------------------------------------------

SCRIPTNAME="$(basename ${0})"
APICREDS=39fa027f-4210-4b46-ae56-4f5d50a0bbae
# API 'enterprise' host and cred/token
APIHOST_ENT=${APIHOST_ENT:-"https://api.boundary.com"}
APICREDS_ENT=
# API 'premium' host and cred/token
APIHOST_PRE=${APIHOST_PRE:-"https://api.truesight.bmc.com"}
APICREDS_PRE=

METERTAGS=
METERPROPERTIES=

SUPPORTED_ARCH=0
SUPPORTED_PLATFORM=0

APT="apt.truesight.bmc.com"
YUM="yum.truesight.bmc.com"
SMARTOS="smartos.truesight.bmc.com"
FREEBSD="freebsd.truesight.bmc.com"
GENTOO="gentoo.truesight.bmc.com"
OSX="mac.truesight.bmc.com"
ALPINE="alpine.truesight.bmc.com"
ARCHLINUX="archlinux.truesight.bmc.com"

APT_CMD="apt-get -q -y --force-yes"
YUM_CMD="yum -d0 -e0 -y"

STAGING="false"

FEATURES="flow_metrics"
DEFEATURES=""

trap "exit" INT TERM EXIT

function print_supported_platforms() {
    echo
    echo "Supported platforms by the installation script are:"
    for d in ${PLATFORMS[*]}
    do
        echo -n " * $d:"
        foo="\${${d}_VERSIONS[*]}"
        versions=`eval echo $foo`
        for v in $versions; do
            echo -n " $v"
        done
        echo ""
    done
}

function print_pgp_key() {
    cat <<-EOF
-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: GnuPG v1.4.10 (GNU/Linux)

mQENBE3WllEBCADlEuA7DCcI0B1/1rXJ4SzzQGXcHwmsxLVGnRR9FX4Fu3oCz4sc
18/FkPHb2AwFfClv4xH6gOUBJVCDyub/C6PJeLolkc51SLA2lO3y5e3OpJ7uC8Ln
/P5AC96FDhIEPH+vVnBVxgYRFj/1vDlqUcJXUSN3ZnLxzHwnHJ+lATNydbTi3ltL
Kr53YOD5FmuKpc2hkNzT+9Lg1/aVEKXpnSjzlNT/1VIrXgJOzv/xyKvpSD2fb5M3
QZMjEkrod5botvclt/y6P8LNWsmlG0eM+JiewnDzwJ3OnhekSzHqoh3kVKQ3YJed
i1ZKInNthXQ5sSiHrsxHhJFGuVAQVA0/AmJfABEBAAG0G0JvdW5kYXJ5IDxvcHNA
Ym91bmRhcnkuY29tPokBOAQTAQIAIgUCTdaWUQIbAwYLCQgHAwIGFQgCCQoLBBYC
AwECHgECF4AACgkQQ4Go5GUyzCAqWggAjuJgzEYO1nTVd4hBhkhuxH1d/9R5eDzN
SvxMk9gI2kKd71DsVP7PCVlPPIkzqL/IMv5ffO3me3R0S3bZzquhCOhrUc987GgZ
+rPEcb0sDjT4fzcVeAOuaIf3T8oysx9ngB5pE4i3fatD43WvTGbj4LmU9XxiwZ6z
AKzIYltGy/+Cq2JJjYgg80O2RmG8FFf8k/FujkbsNgNICQwWnAGKKlpJ4b65M5zu
oNNUGFcJopGGufKLxXAiRwJqOx8a+EvD7/MEs5VYQJGeBgoaE6ZgXwufYJYn0Lv3
6fxTtkLlIrD27gvTbV1oF8tj+T+7ayKj75YGnaH03QYBOG8tmbqV/A==
=p4gi
-----END PGP PUBLIC KEY BLOCK-----
EOF
}

function print_rsa_key() {
	cat <<-EOF
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA21devhrq4bBpIgOOwm/N
Ptoa4FPigA+TRd/mSc6lidT9D2CrGwflrZqEl4hUacZ9/cfqJaHD8U/tCuEncyr+
cQ1TB5EMYNcqYOXcBK1RDfZwfJlacKpxCuI8D4C+bRW0DIzo6+60z/rl459AQSCo
eWDH43WwWWA60K4CjEjYRzXfBrv4MBCPhhCHa8JpqPnJzxA11K6fsdRK4vHSqdvt
Y6bsZFftqoHkffPf+ixMJPaTyStmdi01Wwp3/2R11MN0Ii1nahJbaMEJIgx9t79C
J98JHskLUc23mgRNsWXWyZ96r0v7F7DEzqTXyIIJvJno1h+I7D1bRyS4u81OuIrH
nwIDAQAB
-----END PUBLIC KEY-----
EOF
}

function check_distro_version() {
    PLATFORM=$1
    DISTRO=$2
    VERSION=$3

    TEMP="\${${DISTRO}_versions[*]}"
    VERSIONS=`eval echo $TEMP`
    VERSION_CMP=

    if [ $DISTRO = "Ubuntu" ]; then
        MAJOR_VERSION=`echo $VERSION | awk -F. '{print $1}'`
        MINOR_VERSION=`echo $VERSION | awk -F. '{print $2}'`
        VERSION_CMP=$MAJOR_VERSION.$MINOR_VERSION

    elif [ $DISTRO = "CentOS" ] || [ $DISTRO = "RHEL" ] || [ $DISTRO = "Oracle" ] || [ $DISTRO = "Scientific" ] || [ $DISTRO = "SHMZ" ] || [ $DISTRO = "CloudLinux" ]; then
        MAJOR_VERSION=`echo $VERSION | awk -F. '{print $1}'`
        VERSION_CMP=$MAJOR_VERSION

    elif [ $DISTRO = "Amazon" ]; then
        VERSION=`echo $PLATFORM | awk '{print $5}'`
        # Some of these include minor numbers. Trim.
        VERSION_CMP=${VERSION:0:7}

    elif [ $DISTRO = "Debian" ]; then
        MAJOR_VERSION=`echo $VERSION | awk -F. '{print $1}'`
        VERSION_CMP=$MAJOR_VERSION

    else
        VERSION_CMP=$VERSION
    fi

    TEMP="\${${DISTRO}_VERSIONS[*]}"
    VERSIONS=`eval echo $TEMP`

    for v in $VERSIONS ; do
        if [ "$VERSION_CMP" = "$v" ]; then
            return 0
        fi
    done

    echo "$DISTRO $VERSION is not officially supported yet"
    return 1
}

function print_help() {
    echo "${SCRIPTNAME} [-s] -i <API token>[,<API token>] \\"
    i=0; while [ ${i} -le ${#SCRIPTNAME} ]; do echo -n " "; i=$((i + 1)); done
    echo "[--enable-flow-metrics] [--enable-server-metrics] \\"
    i=0; while [ ${i} -le ${#SCRIPTNAME} ]; do echo -n " "; i=$((i + 1)); done
    echo "[--gd-relay-file <file>]"
    echo
    echo " Basic options:"
    echo "   -i: Required input for authentication. The API token can be one (or both) of"
    echo "       the following:"
    echo
    echo "         - TrueSight Pulse/Intelligence (new accounts)"
    echo "            The token format is XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX, which can be found in"
    echo "            'Settings->Account' as 'Your API token'."
    echo "         - TrueSight Pulse/Intelligence (old accounts)"
    echo "            The API token is api.XXXXXXXXXX-XXXX, which can be found in"
    echo "            'Settings->Account' as 'Your API token'."
    echo
    echo "   -s: Install the latest testing meter from the staging repositories"
    echo "   -t: comma-separated list of tags (labels) to assign this meter"
    echo "   -p: comma-separated list of properties (key/value pairs) to assign this meter"
    echo
    echo " Advanced options:"
    echo "   --enable-flow-metrics:   Enable reporting network flow metrics (default)"
    echo "   --enable-server-metrics: Enable reporting host level metrics"
    echo "   --disable-metrics:       Disable reporting of all metrics"
    echo "   --gd-relay-file <file>:  Import relay settings file (e.g. config.json)"
    exit 0
}

function do_install() {
    # export 'enterprise' and 'premium' tokens to the environment...
    export INSTALLTOKEN="${APICREDS}"
    export INSTALLTOKENS="${APICREDS}"
    export PROVISIONPREMIUMAPIHOST="${APIHOST_PRE}"
    export PROVISIONENTERPRISEAPIHOST="${APIHOST_ENT}"
    export PROVISIONTAGS="${METERTAGS}"
    export PROVISIONPROPERTIES="${METERPROPERTIES}"
    export PROVISIONFEATURES="${FEATURES}"
    export PROVISIONDEFEATURES="${DEFEATURES}"
    export GDRELAYFILE="${GDRELAYFILE}"
    if [ "$DISTRO" = "Ubuntu" ] || [ $DISTRO = "Debian" ]; then
        APT_STRING="deb https://${APT}/ubuntu/ `get $DISTRO $MAJOR_VERSION.$MINOR_VERSION` universe"
        if [ "$DISTRO" = "Debian" ]; then
            APT_STRING="deb https://${APT}/debian/ `get $DISTRO $MAJOR_VERSION` main"
        fi
        echo -n "Adding repository $APT_STRING..."
        sh -c "echo \"$APT_STRING\" > /etc/apt/sources.list.d/truesight.list"

        print_pgp_key | apt-key add -
        if [ $? -gt 0 ]; then
            echo "Error adding Truesight GPG key to list of trusted keys!"
            exit 1
        fi

        echo "Updating apt repository cache..."
        $APT_CMD update > /dev/null
        $APT_CMD install truesight-meter
        return $?

    elif [ "$DISTRO" = "openSUSE" ]; then
        GPG_KEY_LOCATION=/tmp/RPM-GPG-KEY-Truesight
        ARCH_STR="x86_64/"

        print_pgp_key > ${GPG_KEY_LOCATION}
        rpm --import ${GPG_KEY_LOCATION}
        if [ $? -gt 0 ]; then
            echo "Error adding Truesight GPG key to list of trusted keys!"
            exit 1
        fi

        echo "Adding repository http://${YUM}/opensuse/os/$VERSION/$ARCH_STR"
        zypper addrepo -c -k -f -g http://${YUM}/opensuse/os/$VERSION/$ARCH_STR truesight

        zypper install -f -y truesight-meter
        return $?

    elif [ "$DISTRO" = "CentOS" ] || [ $DISTRO = "Amazon" ] || [ $DISTRO = "RHEL" ] || [ $DISTRO = "Oracle" ] || [ $DISTRO = "Scientific" ] || [ $DISTRO = "SHMZ" ] || [ $DISTRO = "CloudLinux" ]; then
        GPG_KEY_LOCATION=/etc/pki/rpm-gpg/RPM-GPG-KEY-Truesight
        if [ "$MACHINE" = "i686" ]; then
            ARCH_STR="i386/"
        elif [ "$MACHINE" = "x86_64" ]; then
            ARCH_STR="x86_64/"
        fi

        # Amazon hack: we know the Amazon Linux AMIs are binary
        # compatible with CentOS
        if [ $DISTRO = "Amazon" ]; then
            if [ "${VERSION:0:7}" = "2016.03" ]; then
                MAJOR_VERSION=7
            else
                MAJOR_VERSION=6
            fi
        fi

        echo "Adding repository http://${YUM}/centos/os/$MAJOR_VERSION/$ARCH_STR"

        sh -c "cat - > /etc/yum.repos.d/truesight.repo <<EOF
[truesight]
name=truesight
baseurl=http://${YUM}/centos/os/$MAJOR_VERSION/$ARCH_STR
gpgcheck=1
gpgkey=file://$GPG_KEY_LOCATION
enabled=1
EOF"

        print_pgp_key > ${GPG_KEY_LOCATION}
        $YUM_CMD install truesight-meter
        return $?

    elif [ "$DISTRO" = "SmartOS" ]; then
      PKGINSTALL_FILE=/opt/local/etc/pkg_install.conf
      if [ -f ${PKGINSTALL_FILE} -a -n "`grep 'VERIFIED_INSTALLATION=always' ${PKGINSTALL_FILE}`" ]; then
        echo
        echo "The VERIFIED_INSTALLATION value in ${PKGINSTALL_FILE} won't allow"
        echo "the current meter package to install.  Please change this value to 'trusted' or 'interactive'"
        echo "to allow the current meter package to install, then try again."
        echo
        return 1
      fi
      SMARTOS_PKG="`curl -k -s https://${SMARTOS}/${MACHINE}/latest`"
      curl -k -s https://${SMARTOS}/${MACHINE}/${SMARTOS_PKG} > ${SMARTOS_PKG}
      pkg_add -f -v ${SMARTOS_PKG}
      return $?

    elif [ "$DISTRO" = "FreeBSD" ]; then
        # Use the way which works for https per OS ver.
        if [ -n "$(echo ${VERSION} | sed -n '/^1[0-9]/p')" ]; then
            curl -s "https://${FREEBSD}/`echo ${VERSION} | awk -F '-' '{print $1}'`/${MACHINE}/truesight-meter-current.txz" > truesight-meter-current.txz
        else
            fetch "https://${FREEBSD}/`echo ${VERSION} | awk -F '-' '{print $1}'`/${MACHINE}/truesight-meter-current.txz"
        fi
        pkg add truesight-meter-current.txz

        if [ "$VERSION" = "11" ]; then
			# This is a hack to get around changes in FreeBSD 11 in rc.subr
            service truesight-meter stop 2>1 /dev/null
            rm -rf /var/run/truesight-meter.pid
            service truesight-meter start
        fi

    elif [ "$DISTRO" = "Gentoo" ]; then
        if [ -e truesight-meter ]; then
            echo
            echo "The installation script needs to create a 'truesight-meter' directory in the current"
            echo "working directory for installation to proceed. Please run this script from"
            echo "another location or remove the currently-existing 'truesight-meter' file or directory"
            echo "and try again."
            echo
            return 1
        fi
        mkdir truesight-meter
        (cd truesight-meter;
         wget "http://${GENTOO}/engineyard/latest"
         wget "http://${GENTOO}/engineyard/`cat latest`")
        ebuild --skip-manifest truesight-meter/`cat truesight-meter/latest` merge
        rm -fr truesight-meter
    elif [ "$DISTRO" = "OSX" ]; then
        curl https://$OSX/truesight-meter-current-osx-x86_64.tar.gz > truesight-meter.tar.gz
        tar xvf truesight-meter.tar.gz
        cd truesight-meter-*
        chmod +x ./start.sh
        ./start.sh -i ${APICREDS} -a ${APIHOST_PRE}
		echo "To start the meter again, run './start.sh' in the `truesight-meter-*` directory"
    elif [ "$DISTRO" = "Alpine" ]; then
        RSA_KEY_LOCATION=/etc/apk/keys/truesight-557ee6e0.rsa.pub
        print_rsa_key > ${RSA_KEY_LOCATION}
        curl -s https://$ALPINE/v${VERSION}/${MACHINE}/truesight-meter-current.apk > truesight-meter-current.apk
        apk add truesight-meter-current.apk
        truesight-meter-provision -i ${APICREDS}
        /etc/init.d/truesight-meter restart
     elif [ "$DISTRO" = "ArchLinux" ]; then
          curl -s https://$ARCHLINUX/v${VERSION}/${MACHINE}/truesight-meter-current.pkg.tar.xz > truesight-meter-current.pkg.tar.xz
          pacman -U truesight-meter-current.pkg.tar.xz
          truesight-meter-provision -i ${APICREDS}
          systemctl restart truesight-meter
    fi
}

function pre_install_sanity() {

    # Distro/version hacks.

    if [ "$DISTRO" = "Ubuntu" ] && [ "$MAJOR_VERSION" = "16" ]; then
        # Ubuntu 16 doesn't like --force-yes
        APT_CMD="apt-get -q -y"
    fi

    which curl > /dev/null
    if [ $? -gt 0 ]; then
        echo "Installing curl ..."

        if [ $DISTRO = "Ubuntu" ] || [ $DISTRO = "Debian" ]; then
            echo "Updating apt repository cache..."
            $APT_CMD update > /dev/null
            $APT_CMD install curl

        elif [ $DISTRO = "CentOS" ] || [ $DISTRO = "Amazon" ] || [ $DISTRO = "RHEL" ] || [ $DISTRO = "Oracle" ] || [ $DISTRO = "Scientific" ] || [ $DISTRO = "SHMZ" ] || [ $DISTRO = "CloudLinux" ]; then
            if [ "$MACHINE" = "i686" ]; then
                $YUM_CMD install curl.i686
            elif [ "$MACHINE" = "x86_64" ]; then
                $YUM_CMD install curl.x86_64
            fi

        elif [ $DISTRO = "FreeBSD" ]; then
            pkg install -y curl
        fi
    fi

    if [ $DISTRO = "SmartOS" ]; then
        CURL="`which curl` -k"
    else
        CURL="`which curl`"
    fi

    if [ $DISTRO = "Ubuntu" ] || [ $DISTRO = "Debian" ]; then
        test -f /usr/lib/apt/methods/https
        if [ $? -gt 0 ];then
            echo "apt-transport-https is not installed to access Truesight's HTTPS based APT repository ..."
            echo "Updating apt repository cache..."
            $APT_CMD update > /dev/null
            echo "Installing apt-transport-https ..."
            $APT_CMD install apt-transport-https
        fi
    fi
}

function update_api_creds() {
    for i in `echo $APICREDS|sed 's/,/ /g'`; do
        if [ -z "$APICREDS_PRE" ]; then
            if [ -n "`echo $i | sed -n '/^.\{8\}-.\{4\}-4.\{3\}-[89abAB].\{3\}-.\{12\}$/p'`" ]; then
                # TS token
                APICREDS_PRE=${i}
            elif [ -n "`echo $i | sed -n '/^api/p'`" ]; then
                # Pulse token (older format)
                APICREDS_PRE=${i}
            fi
	elif [ -z "$APICREDS_ENT" -a -n "`echo $i | sed -n '/:/p'`" ]; then
            # Enterprise token
            APICREDS_ENT=${i}
        fi
    done
}

function update_features() {
    if [ -z "${FEATURES}" ]; then
        FEATURES="${1}"
    else
        FEATURES="${FEATURES},${1}"
    fi
}

# Grab some system information
if [ -f /etc/redhat-release ] ; then
    PLATFORM=`cat /etc/redhat-release`
    DISTRO=`echo $PLATFORM | awk '{print $1}'`
    if [ "$DISTRO" = "Fedora" ]; then
       DISTRO="RHEL"
       VERSION="6"
    else
       if [ "$DISTRO" != "CentOS" ]; then
           if [ "$DISTRO" = "Enterprise" ] || [ -f /etc/oracle-release ]; then
                # Oracle "Enterprise Linux"/"Linux"
                DISTRO="Oracle"
                VERSION=`echo $PLATFORM | awk '{print $7}'`
           elif [ "$DISTRO" = "Red" ]; then
                DISTRO="RHEL"
                VERSION=`echo $PLATFORM | awk '{print $7}'`
           elif [ "$DISTRO" = "Scientific" ]; then
                VERSION=`echo $PLATFORM | awk '{print $4}'`
           elif [ "$DISTRO" = "SHMZ" ]; then
                VERSION=`echo $PLATFORM | awk '{print $3}'`
           elif [ "$DISTRO" = "CloudLinux" ]; then
               if [ "`echo $PLATFORM | awk '{print $2}'`" = "Server" ]; then
                   VERSION=`echo $PLATFORM | awk '{print $4}'`
               else
                   # CL 7 does not have "Server" in the release name
                   VERSION=`echo $PLATFORM | awk '{print $3}'`
               fi
           else
                DISTRO="unknown"
                PLATFORM="unknown"
                VERSION="unknown"
           fi
       elif [ "$DISTRO" = "CentOS" ]; then
           if [ "`echo $PLATFORM | awk '{print $2}'`" = "Linux" ]; then
                # CentOS 7 now includes "Linux" in the release string...
                VERSION=`echo $PLATFORM | awk '{print $4}'`
           else
                VERSION=`echo $PLATFORM | awk '{print $3}'`
           fi
       fi
    fi
    MACHINE=`uname -m`
elif [ -f /etc/system-release ]; then
    PLATFORM=`cat /etc/system-release | head -n 1`
    DISTRO=`echo $PLATFORM | awk '{print $1}'`
    VERSION=`echo $PLATFORM | awk '{print $5}'`
    MACHINE=`uname -m`
elif [ -f /etc/lsb-release ] ; then
    #Ubuntu version lsb-release - https://help.ubuntu.com/community/CheckingYourUbuntuVersion
    . /etc/lsb-release
    PLATFORM=$DISTRIB_DESCRIPTION
    DISTRO=$DISTRIB_ID
    VERSION=$DISTRIB_RELEASE
    MACHINE=`uname -m`
    if [ "$DISTRO" = "LinuxMint" ]; then
       DISTRO="Ubuntu"
       VERSION="12.04"
    fi
elif [ -f /etc/debian_version ] ; then
    #Debian Version /etc/debian_version - Source: http://www.debian.org/doc/manuals/debian-faq/ch-software.en.html#s-isitdebian
    DISTRO="Debian"
    VERSION=`cat /etc/debian_version`
    INFO="$DISTRO $VERSION"
    PLATFORM=$INFO
    MACHINE=`uname -m`
elif [ -f /etc/arch-release ] ; then
	PLATFORM="ArchLinux"
	DISTRO="ArchLinux"
	VERSION=4
	MACHINE=`uname -m`
elif [ -f /etc/os-release ] ; then
    . /etc/os-release
    PLATFORM=$PRETTY_NAME
    DISTRO=$NAME
    VERSION=$VERSION_ID
    MACHINE=`uname -m`
elif [ -f /etc/gentoo-release ] ; then
    PLATFORM="Gentoo"
    DISTRO="Gentoo"
    VERSION=`cat /etc/gentoo-release | cut -d ' ' -f 5`
    MACHINE=`uname -m`
elif [ -f /etc/alpine-release ] ; then
    PLATFORM="Alpine"
    DISTRO="Alpine"
    VERSION=`cat /etc/alpine-release | cut -d '.' -f 1-2`
    MACHINE=`uname -m`
else
    PLATFORM=`uname -sv | grep 'SunOS joyent'` > /dev/null
    if [ "$?" = "0" ]; then
      PLATFORM="SmartOS"
      DISTRO="SmartOS"
      MACHINE="i386"
      VERSION=13
    elif [ "$?" != "0" ]; then
        uname -sv | grep 'FreeBSD' > /dev/null
        if [ "$?" = "0" ]; then
            PLATFORM="FreeBSD"
            DISTRO="FreeBSD"
            VERSION=`uname -r | cut -d '.' -f 1`
            MACHINE=`uname -m`
        else
            uname -sv | grep 'Darwin' > /dev/null
            if [ "$?" = "0" ]; then
                PLATFORM="Darwin"
                DISTRO="OSX"
                VERSION=`uname -r`
                MACHINE=`uname -m`
            fi
        fi
    fi
fi

ENABLE_FLOW_METRICS=""
ENABLE_SERVER_METRICS=""
GDRELAYFILE=""
while getopts "hdsi:t:p:f:-:" opts; do
    case $opts in
        h)  print_help;;
        s)  STAGING="true";;
        i)  APICREDS="$OPTARG";;
        t)  METERTAGS="$OPTARG";;
        p)  METERPROPERTIES="$OPTARG";;
        f)  echo "WARNING! You are OVERRIDING this script's OS detection."
            echo "On unsupported platforms, your mileage may vary!"
            print_supported_platforms
            echo "Please contact help@truesight.bmc.com to request support for your architecture."

            # This takes input basically of the form "OS VERSION" for the OS
            # you're mimicking.
            # E.g., "CentOS 6.2", "Ubuntu 11.10", etc.
            PLATFORM="$OPTARG"
            DISTRO=`echo $PLATFORM | awk '{print $1}'`
            VERSION=`echo $PLATFORM | awk '{print $2}'`

            echo "Script will masquerade as \"$PLATFORM\""
            ;;
        -)  case ${OPTARG} in
                enable-flow-metrics)
                    ENABLE_FLOW_METRICS="flow_metrics"
                    ;;
                enable-server-metrics)
                    ENABLE_SERVER_METRICS="server_metrics"
                    ;;
                disable-metrics)
                    ENABLE_FLOW_METRICS=""
                    ENABLE_SERVER_METRICS=""
                    FEATURES=""
                    ;;
                gd-relay-file)
                    GDRELAYFILE="${!OPTIND}"
                    shift
                    if [ -z "${GDRELAYFILE}" ]; then
                        echo "Error: missing config filename for --${OPTARG} arg."
                        exit 1
                    elif [ ! -f "${GDRELAYFILE}" ]; then
                        echo "Error: could not find file '${GDRELAYFILE}'"
                        exit 1
                    fi
                    ;;
                *)
                    echo "Error: unrecognized option '--${OPTARG}'"
                    echo print_help
                    ;;
            esac
            ;;
        [?]) print_help;;
    esac
done

update_api_creds

if [ -n "${ENABLE_FLOW_METRICS}" -o -n "${ENABLE_SERVER_METRICS}" ]; then
    FEATURES=""
    for f in ${ENABLE_FLOW_METRICS} ${ENABLE_SERVER_METRICS}; do
        if [ -n "${FEATURES}" ]; then
            FEATURES="${FEATURES},${f}"
        else
            FEATURES=${f}
        fi
    done
fi

if [ $STAGING = "true" ]; then
    APT="apt.truesight-staging.bmc.com"
    YUM="yum.truesight-staging.bmc.com"
    SMARTOS="smartos.truesight-staging.bmc.com"
    FREEBSD="freebsd.truesight-staging.bmc.com"
    GENTOO="gentoo.truesight-staging.bmc.com"
    OSX="mac.truesight-staging.bmc.com"
    ALPINE="alpine.truesight-staging.bmc.com"
    ARCHLINUX="archlinux.truesight-staging.bmc.com"
fi

# If this script is being run by root for some reason, don't use sudo.
if [ ${DISTRO} != "OSX" -a "$(id -u)" != "0" ]; then
    SUDO=`which sudo`
    if [ $? -ne 0 ]; then
        echo "This script must be executed as the 'root' user or with sudo"
        echo "in order to install the Truesight meter."
        echo
        echo "Please install sudo or run again as the 'root' user."
        echo "For assistance, help@truesight.bmc.com"
        exit 1
    else
        sudo -E $0 $@
        exit 0
    fi
fi

if [ "$MACHINE" = "i686" ] ||
   [ "$MACHINE" = "i586" ] ||
   [ "$MACHINE" = "i386" ] ; then
    ARCH="32"
    SUPPORTED_ARCH=1
fi

#determine hard vs. soft float using readelf
if [[ "$MACHINE" == arm* ]] ; then
    if [ -x /usr/bin/readelf ] ; then
        HARDFLOAT=`readelf -a /proc/self/exe | grep armhf`
        if [ -z "$HARDFLOAT" ]; then
            if [ "$MACHINE" = "armv7l" ] ||
               [ "$MACHINE" = "armv6l" ] ||
               [ "$MACHINE" = "armv5tel" ] ||
               [ "$MACHINE" = "armv5tejl" ] ; then
                ARCH="32"
                SUPPORTED_ARCH=1
                echo "Detected $MACHINE running armel..."
            fi
        else
            if [ "$MACHINE" = "armv7l" ] ; then
                ARCH="32"
                SUPPORTED_ARCH=1
                echo "Detected $MACHINE running armhf..."
            else
                echo "$MACHINE with armhf ABI is not supported. Try the armel ABI"
            fi
        fi
    else
        echo "Cannot determine ARM ABI, please install the 'binutils' package"
    fi
fi

if [ "$MACHINE" = "x86_64" ] || [ "$MACHINE" = "amd64" ]; then
    ARCH="64"
    SUPPORTED_ARCH=1
fi

if [ $SUPPORTED_ARCH -eq 0 ]; then
    echo "Unsupported architecture ($MACHINE) ..."
    echo "This is an unsupported platform for the Truesight Meter."
    echo "Please contact help@truesight.bmc.com to request support for this architecture."
    exit 1
fi

# Check the distribution
for d in ${PLATFORMS[*]} ; do
    if [ "$DISTRO" = "$d" ]; then
        SUPPORTED_PLATFORM=1
        break
    fi
done
if [ $SUPPORTED_PLATFORM -eq 0 ]; then
    echo "Your platform is not supported by this script at this time."
    echo "Please check https://help.truesight.bmc.com/hc/en-us/articles/201856852-BMC-TrueSight-Pulse-Meter-Meter-Installer-Variables for alternate installation instructions."
    print_supported_platforms
    exit 1
fi

if [ -z "$APICREDS" ]; then
    print_help
fi

if [ -n "$APICREDS_ENT" ]; then
    APIID=`echo $APICREDS_ENT | awk -F: '{print $1}'`
    APIKEY=`echo $APICREDS_ENT | awk -F: '{print $2}'`
    if [ "${#APIID}" -lt 10 -o "${#APIKEY}" -lt 10 ]; then
        echo "Please enter a valid Truesight Enterprise installation token"
        echo "Expected APIID:APIKEY, got: '${APICREDS_ENT}'"
        echo

        print_help
    fi
fi

if [ -n "$APICREDS_PRE" ]; then
    CREDS_INVALID=""
    if [ "${DISTRO}" = "FreeBSD" -o "${DISTRO}" = "OSX" -o "${DISTRO}" = "SmartOS" ]; then
        if [ -z "`echo ${APICREDS_PRE} | sed -E -n '/api\.[0-9a-fA-F]+-[0-9]+$/p'`" -a \
                -z "`echo ${APICREDS_PRE} | sed -n '/^.\{8\}-.\{4\}-4.\{3\}-[89abAB].\{3\}-.\{12\}$/p'`" ]; then
            CREDS_INVALID="yes"
        fi
    else
        if [ -z "`echo ${APICREDS_PRE} | sed -n '/api\.[0-9a-fA-F]\+-[0-9]\+$/p'`" -a \
                -z "`echo ${APICREDS_PRE} | sed -n '/^.\{8\}-.\{4\}-4.\{3\}-[89abAB].\{3\}-.\{12\}$/p'`" ]; then
            CREDS_INVALID="yes"
        fi
    fi
    if [ -n "${CREDS_INVALID}" ]; then
        echo "Please enter a valid TrueSight Pulse/Intelligence installation token"
        echo "Expected APITOKEN, got: '${APICREDS_PRE}'"
        echo

        print_help
    fi
fi

echo "Detected $DISTRO $VERSION..."

# Check the version number
UNSUPPORTED_RELEASE=0
check_distro_version "$PLATFORM" $DISTRO $VERSION
if [ $? -ne 0 ]; then
    UNSUPPORTED_RELEASE=1
fi

# The version number hasn't been found; let's just try and masquerade
# (and tell users what we're doing)
if [ $UNSUPPORTED_RELEASE -eq 1 ] ; then
    TEMP="\${${DISTRO}_VERSIONS[*]}"
    VERSIONS=`eval echo $TEMP`
    # Assume ordered list; grab latest version
    VERSION=`echo $VERSIONS | awk '{print $NF}'`
    MAJOR_VERSION=`echo $VERSION | awk -F. '{print $1}'`
    MINOR_VERSION=`echo $VERSION | awk -F. '{print $2}'`
    echo "Continuing; for reference, script is masquerading as: $DISTRO $VERSION"
fi

# At this point, we think we have a supported OS.
pre_install_sanity $d $v

do_install

if [ $? -ne 0 ]; then
    echo "The meter installation failed."
    echo "For help, please contact help@truesight.bmc.com describing the problem."
    exit 1
fi

echo ""
echo "The meter has been installed successfully!"

exit 0
